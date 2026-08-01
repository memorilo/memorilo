import type { Effect, SchemaAST } from 'effect'
import { Exit, Option, Schema, SchemaIssue } from 'effect'
import { topicProseMirrorSchema } from './topic-prosemirror-schema'

export type LoroTopicNodeType
  = | 'blockquote'
    | 'cardDelimiter'
    | 'codeBlock'
    | 'hardBreak'
    | 'heading'
    | 'horizontalRule'
    | 'image'
    | 'list'
    | 'mathBlock'
    | 'mathInline'
    | 'paragraph'
    | 'table'
    | 'tableCell'
    | 'tableHeaderCell'
    | 'tableRow'
    | 'tag'
    | 'text'

export type LoroTopicMarkType
  = | 'bold'
    | 'cloze'
    | 'code'
    | 'inlineHighlight'
    | 'italic'
    | 'link'
    | 'strike'
    | 'underline'

export interface LoroTopicNode {
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly LoroTopicNode[]
  readonly marks?: ReadonlyArray<{
    readonly attrs?: Readonly<Record<string, unknown>>
    readonly type: LoroTopicMarkType
  }>
  readonly text?: string
  readonly type: LoroTopicNodeType
}

export interface LoroTopicDocument {
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly LoroTopicNode[]
  readonly type: 'doc'
}

const strictParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
} as const

const AttributesSchema = Schema.Record(Schema.String, Schema.Unknown)
const MarkSchema = Schema.Struct({
  attrs: Schema.optionalKey(AttributesSchema),
  type: Schema.Literals(['bold', 'cloze', 'code', 'inlineHighlight', 'italic', 'link', 'strike', 'underline']),
})
const NodeTypeSchema = Schema.Literals([
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
])

export const LoroTopicNodeSchema: Schema.Codec<LoroTopicNode> = Schema.Struct({
  attrs: Schema.optionalKey(AttributesSchema),
  content: Schema.optionalKey(Schema.Array(Schema.suspend(() => LoroTopicNodeSchema))),
  marks: Schema.optionalKey(Schema.Array(MarkSchema)),
  text: Schema.optionalKey(Schema.String),
  type: NodeTypeSchema,
})

const blockNodeTypes = new Set<LoroTopicNodeType>([
  'blockquote',
  'codeBlock',
  'heading',
  'horizontalRule',
  'image',
  'list',
  'mathBlock',
  'paragraph',
  'table',
])
const inlineNodeTypes = new Set<LoroTopicNodeType>(['cardDelimiter', 'hardBreak', 'mathInline', 'tag', 'text'])
const tableCellNodeTypes = new Set<LoroTopicNodeType>(['tableCell', 'tableHeaderCell'])

type ChildExpectation = 'block' | 'inline' | 'table-cell' | 'table-row' | 'text'

function validateTopicDocument(
  document: LoroTopicDocument,
  ast: SchemaAST.AST,
  options: SchemaAST.ParseOptions,
): undefined | SchemaIssue.Issue {
  const blockIds = new Set<string>()
  const issues: SchemaIssue.Issue[] = []

  const addIssue = (path: readonly PropertyKey[], actual: unknown, message: string): void => {
    issues.push(new SchemaIssue.Pointer(
      path,
      new SchemaIssue.InvalidValue(Option.some(actual), { message }),
    ))
  }

  const expectChild = (
    child: LoroTopicNode,
    path: readonly PropertyKey[],
    expectation: ChildExpectation,
  ): void => {
    const valid = expectation === 'block'
      ? blockNodeTypes.has(child.type)
      : expectation === 'inline'
        ? inlineNodeTypes.has(child.type)
        : expectation === 'table-cell'
          ? tableCellNodeTypes.has(child.type)
          : child.type === expectation
    if (!valid)
      addIssue([...path, 'type'], child.type, `expected a ${expectation} Topic node`)
  }

  const visit = (node: LoroTopicNode, path: readonly PropertyKey[]): void => {
    const children = node.content ?? []
    const nodeType = topicProseMirrorSchema.nodes[node.type]
    const allowedNodeAttrs = new Set(Object.keys(nodeType?.spec.attrs ?? {}))
    for (const [name, value] of Object.entries(node.attrs ?? {})) {
      if (!allowedNodeAttrs.has(name))
        addIssue([...path, 'attrs', name], value, `unexpected attribute for Topic node ${node.type}`)
    }
    for (const [markIndex, mark] of (node.marks ?? []).entries()) {
      const markType = topicProseMirrorSchema.marks[mark.type]
      const allowedMarkAttrs = new Set(Object.keys(markType?.spec.attrs ?? {}))
      for (const [name, value] of Object.entries(mark.attrs ?? {})) {
        if (!allowedMarkAttrs.has(name))
          addIssue([...path, 'marks', markIndex, 'attrs', name], value, `unexpected attribute for Topic mark ${mark.type}`)
      }
    }
    if (node.type !== 'text' && node.text !== undefined)
      addIssue([...path, 'text'], node.text, `Topic node ${node.type} must not contain text directly`)
    if (!inlineNodeTypes.has(node.type) && node.marks !== undefined)
      addIssue([...path, 'marks'], node.marks, `Topic node ${node.type} must not contain marks`)

    let childExpectation: ChildExpectation | undefined
    let requiresChildren = false

    switch (node.type) {
      case 'list': {
        const blockId = node.attrs?.blockId
        if (typeof blockId !== 'string' || blockId.length === 0) {
          addIssue([...path, 'attrs', 'blockId'], blockId, 'expected a non-empty Topic blockId')
        }
        else if (blockIds.has(blockId)) {
          addIssue([...path, 'attrs', 'blockId'], blockId, `duplicate Topic blockId: ${blockId}`)
        }
        else {
          blockIds.add(blockId)
        }

        const kind = node.attrs?.kind
        if (typeof kind !== 'string' || kind.length === 0)
          addIssue([...path, 'attrs', 'kind'], kind, 'expected a non-empty Topic block kind')
        childExpectation = 'block'
        requiresChildren = true
        break
      }
      case 'blockquote':
      case 'tableCell':
      case 'tableHeaderCell':
        childExpectation = 'block'
        requiresChildren = true
        break
      case 'heading':
      case 'paragraph':
        childExpectation = 'inline'
        break
      case 'codeBlock':
      case 'mathBlock':
      case 'mathInline':
        childExpectation = 'text'
        break
      case 'table':
        childExpectation = 'table-row'
        requiresChildren = true
        break
      case 'tableRow':
        childExpectation = 'table-cell'
        break
      case 'text':
        if (typeof node.text !== 'string' || node.text.length === 0)
          addIssue([...path, 'text'], node.text, 'expected non-empty Topic text')
        break
      case 'cardDelimiter':
      case 'hardBreak':
      case 'horizontalRule':
      case 'image':
      case 'tag':
        break
    }

    if (requiresChildren && children.length === 0)
      addIssue([...path, 'content'], children, `Topic node ${node.type} requires content`)
    if (!childExpectation && children.length > 0)
      addIssue([...path, 'content'], children, `Topic node ${node.type} must not contain children`)

    children.forEach((child, index) => {
      const childPath = [...path, 'content', index]
      if (childExpectation)
        expectChild(child, childPath, childExpectation)
      visit(child, childPath)
    })
  }

  for (const [name, value] of Object.entries(document.attrs ?? {}))
    addIssue(['attrs', name], value, 'unexpected attribute for the Topic document')

  const roots = document.content ?? []
  if (roots.length === 0)
    addIssue(['content'], roots, 'a Topic document requires at least one block')
  roots.forEach((node, index) => {
    if (node.type !== 'list')
      addIssue(['content', index, 'type'], node.type, 'expected a top-level Topic block with type "list"')
    visit(node, ['content', index])
  })

  try {
    topicProseMirrorSchema.nodeFromJSON(document).check()
  }
  catch (error) {
    addIssue([], document, `invalid ProseMirror Topic document: ${error instanceof Error ? error.message : String(error)}`)
  }

  const [first, ...rest] = issues
  if (!first)
    return undefined
  return new SchemaIssue.Composite(ast, Option.some(document), [
    first,
    ...(options.errors === 'all' ? rest : []),
  ])
}

export const LoroTopicDocumentSchema = Schema.Struct({
  attrs: Schema.optionalKey(AttributesSchema),
  content: Schema.optionalKey(Schema.Array(LoroTopicNodeSchema)),
  type: Schema.Literal('doc'),
}).check(Schema.makeFilter(validateTopicDocument, {
  expected: 'a normalized Topic document with unique blocks',
}))

export const LoroTopicEntrySchema = Schema.Struct({
  blockTreeKey: Schema.NonEmptyString,
  editorMode: Schema.Literals([0, 1]),
  entryId: Schema.NonEmptyString,
  kind: Schema.Literal('topic'),
  title: Schema.String,
})

/** A complete Topic projected from its Loro entry map and referenced block tree. */
export const LoroTopicSchema = Schema.Struct({
  document: LoroTopicDocumentSchema,
  entry: LoroTopicEntrySchema,
}).check(Schema.makeFilter((topic) => {
  const expected = `topic:${topic.entry.entryId}:blocks`
  return topic.entry.blockTreeKey === expected
    ? undefined
    : {
        message: `expected the Topic block tree key ${JSON.stringify(expected)}`,
        path: ['entry', 'blockTreeKey'],
      }
}, {
  expected: 'a Topic whose entry references its own block tree',
}))

export type LoroTopic = typeof LoroTopicSchema.Type
export type LoroTopicValidation = Effect.Effect<LoroTopic, Schema.SchemaError>

/** Validates unknown Topic JSON and retains all schema issues in Effect's error channel. */
export function validateLoroTopic(input: unknown): LoroTopicValidation {
  return Schema.decodeUnknownEffect(LoroTopicSchema)(input, strictParseOptions)
}

/** Returns whether an unknown value has the complete Loro Topic structure. */
export function isLoroTopic(input: unknown): input is LoroTopic {
  return Exit.isSuccess(Schema.decodeUnknownExit(LoroTopicSchema)(input, strictParseOptions))
}
