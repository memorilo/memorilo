import type { EditorNoteStorageProjection } from '@memorilo/application/note-storage'
import type { DeleteNoteEntryStrategy, NoteEntrySnapshot } from '@memorilo/editor/note'

export interface EditorSurfaceSession {
  checkpointSequence: number
  id: string
  latestSequence: number
  snapshot: string | null
  title: string
  updates: readonly string[]
}

export interface SaveEditorSurfaceInput extends EditorNoteStorageProjection {
  journalHasUserContent?: boolean
  noteId: string
  title: string
  updates: readonly string[]
}

export interface SaveEditorSurfaceReceipt {
  latestSequence: number
  updatedAt: number
}

export interface SaveEditorImageInput {
  data: string
  fileName: string
  mimeType: string
}

export interface SavedEditorImage {
  src: string
}

export interface CheckpointEditorSurfaceInput {
  noteId: string
  snapshot: string
  throughSequence: number
}

export interface OpenJournalSurfaceInput extends EditorNoteStorageProjection {
  id: string
  journalDate: string
  snapshot: string
}

export type EditorSurfaceEntryType = 'folder' | 'spreadsheet' | 'topic' | 'whiteboard'

export interface EditorSurfaceStructure {
  entries: readonly NoteEntrySnapshot[]
  selectedTopicId: string | null
}

export type EditorSurfaceCommandInput = {
  type: 'flush'
} | {
  title: string
  type: 'rename-note'
} | {
  type: 'refresh-structure'
} | {
  topicId: string
  type: 'open-topic'
} | {
  entryType: EditorSurfaceEntryType
  label: string
  parentId: string | null
  type: 'create-entry'
} | {
  entryId: string
  label: string
  type: 'rename-entry'
} | {
  entryId: string
  index?: number
  parentId: string | null
  type: 'move-entry'
} | {
  entryId: string
  strategy: DeleteNoteEntryStrategy
  type: 'delete-entry'
}

type WithCommandId<Command> = Command extends EditorSurfaceCommandInput
  ? Command & { id: number }
  : never

export type EditorSurfaceCommand = WithCommandId<EditorSurfaceCommandInput>

export interface EditorSurfaceCommandResult {
  commandId: number
  error?: string
  structure?: EditorSurfaceStructure
  title?: string
}

export function encodeBinary(value: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < value.length; offset += chunkSize)
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize))
  return btoa(binary)
}

export function decodeBinary(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index)
  return bytes
}
