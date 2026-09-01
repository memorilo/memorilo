import type { TopicBlockEdit } from '@memorilo/editor/note'
import type { NoteApplicationService } from '../notes/note-application-service'
import { toError } from '@memorilo/effect-lifecycle'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { NoteRevisionConflictError } from '../notes/note-application-service'

const revisionSchema = z.string().regex(
  /^[0-9a-f]{64}$/u,
  'Revision must be a 64-character lowercase hexadecimal SHA-256 token',
)
const attributesSchema = z.record(z.string(), z.unknown())
const markSchema = z.object({
  attrs: attributesSchema.optional(),
  type: z.enum(['bold', 'cloze', 'code', 'inlineHighlight', 'italic', 'link', 'strike', 'underline']),
})
const nodeSchema: z.ZodType<{
  attrs?: Record<string, unknown>
  content?: unknown[]
  marks?: Array<{ attrs?: Record<string, unknown>, type: string }>
  text?: string
  type: string
}> = z.lazy(() => z.object({
  attrs: attributesSchema.optional(),
  content: z.array(nodeSchema).optional(),
  marks: z.array(markSchema).optional(),
  text: z.string().optional(),
  type: z.enum([
    'blockquote',
    'cardDelimiter',
    'codeBlock',
    'hardBreak',
    'heading',
    'horizontalRule',
    'image',
    'list',
    'mathBlock',
    'mathInline',
    'paragraph',
    'table',
    'tableCell',
    'tableHeaderCell',
    'tableRow',
    'tag',
    'text',
  ]),
}))

const topicBlockEditSchema = z.discriminatedUnion('operation', [
  z.object({
    attributes: attributesSchema.optional(),
    blockId: z.string().min(1).optional(),
    content: z.array(nodeSchema),
    index: z.number().int().min(0).optional(),
    kind: z.string().min(1),
    operation: z.literal('insert-block'),
    parentId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    blockId: z.string().min(1),
    content: z.array(nodeSchema),
    operation: z.literal('update-block-content'),
  }),
  z.object({
    attributes: attributesSchema,
    blockId: z.string().min(1),
    operation: z.literal('update-block-attributes'),
  }),
  z.object({
    blockId: z.string().min(1),
    index: z.number().int().min(0).optional(),
    operation: z.literal('move-block'),
    parentId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    blockId: z.string().min(1),
    operation: z.literal('delete-block'),
    strategy: z.enum(['delete-subtree', 'promote-children']),
  }),
])

function toolResult(value: unknown) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: 'text' as const }],
    structuredContent: value as Record<string, unknown>,
  }
}

function toolError(error: unknown) {
  const value = error instanceof NoteRevisionConflictError
    ? { code: 'revision-conflict', currentRevision: error.currentRevision, message: error.message }
    : { code: 'operation-failed', message: toError(error).message }
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: 'text' as const }],
    isError: true,
    structuredContent: value,
  }
}

async function executeTool(operation: () => Promise<unknown>) {
  try {
    return toolResult(await operation())
  }
  catch (error) {
    return toolError(error)
  }
}

/** Maps the Note application interface onto Memorilo's MCP tool contract. */
export function createMcpNoteProtocolServer(notes: NoteApplicationService): McpServer {
  const server = new McpServer({ name: 'memorilo', version: '0.1.0' })

  server.registerTool('list_notes', {
    description: 'List Memorilo Notes with pagination.',
    inputSchema: {
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      sortBy: z.enum(['createdAt', 'title', 'updatedAt']).optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    },
  }, input => executeTool(() => notes.listNotes(input)))

  server.registerTool('list_topics', {
    description: 'List Topics and Folder/Topic positions. When noteId is omitted, scans one page of Notes.',
    inputSchema: {
      noteId: z.string().min(1).optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
  }, ({ noteId, page, pageSize }) => executeTool(async () => {
    const noteIds = noteId
      ? [noteId]
      : (await notes.listNotes({ page, pageSize, sortBy: 'updatedAt', sortDirection: 'desc' })).items.map(note => note.id)
    const trees = await Promise.all(noteIds.map(id => notes.getNoteTree({ noteId: id })))
    return {
      notes: trees.map(tree => ({
        entries: tree.entries,
        noteId: tree.noteId,
        noteTitle: tree.title,
        revision: tree.revision,
      })),
    }
  }))

  server.registerTool('get_note_tree', {
    description: 'Get the complete Folder and Topic hierarchy for one Memorilo Note.',
    inputSchema: { noteId: z.string().min(1) },
  }, input => executeTool(() => notes.getNoteTree(input)))

  server.registerTool('get_topic', {
    description: 'Get one Topic as a structured ProseMirror Block document. Preserve blockId values when editing.',
    inputSchema: { noteId: z.string().min(1), topicId: z.string().min(1) },
  }, input => executeTool(() => notes.getTopic(input)))

  server.registerTool('search_notes', {
    description: 'Search Note titles and Topic content.',
    inputSchema: { limit: z.number().int().min(1).max(100).optional(), query: z.string().min(1) },
  }, input => executeTool(async () => ({ hits: await notes.searchNotes(input) })))

  server.registerTool('apply_topic_edits', {
    description: 'Atomically apply structural Block edits to one Topic. Read the Topic first and pass its revision.',
    inputSchema: {
      edits: z.array(topicBlockEditSchema).min(1).max(100),
      expectedRevision: revisionSchema,
      noteId: z.string().min(1),
      topicId: z.string().min(1),
    },
  }, input => executeTool(() => notes.applyTopicEdits({
    ...input,
    edits: input.edits as readonly TopicBlockEdit[],
  })))

  server.registerTool('set_topic_mode', {
    description: 'Set a Topic editor mode: 0 for Document or 1 for Outline. Read the Topic first and pass its revision.',
    inputSchema: {
      expectedRevision: revisionSchema,
      mode: z.union([z.literal(0), z.literal(1)]),
      noteId: z.string().min(1),
      topicId: z.string().min(1),
    },
  }, input => executeTool(() => notes.setTopicMode(input)))

  server.registerTool('rename_topic', {
    description: 'Rename one Topic. Read the Note tree or Topic first and pass its revision.',
    inputSchema: {
      expectedRevision: revisionSchema,
      noteId: z.string().min(1),
      title: z.string(),
      topicId: z.string().min(1),
    },
  }, input => executeTool(() => notes.renameTopic(input)))

  return server
}
