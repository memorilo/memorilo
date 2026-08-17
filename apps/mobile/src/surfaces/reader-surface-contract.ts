import type { EditorNoteStorageProjection } from '@memorilo/application/note-storage'
import type { ReaderAnnotation, ReaderPosition } from '@memorilo/editor/reader'
import type { ReadingFormat } from '@memorilo/reading-model'
import type { EditorSurfaceSession } from './editor-surface-contract'

interface ReaderSurfaceDocumentBase {
  byteLength: number
  format: ReadingFormat
  name: string
  originalName: string
  readingId: string
}

export interface BoundReaderSurfaceDocument extends ReaderSurfaceDocumentBase {
  kind: 'bound'
  note: EditorSurfaceSession
  topicId: string
}

export interface UnboundReaderSurfaceDocument extends ReaderSurfaceDocumentBase {
  kind: 'unbound'
  noteTitle: string
  sha256: string
}

export interface LegacyReaderSurfaceDocument extends ReaderSurfaceDocumentBase {
  annotations: readonly ReaderAnnotation[]
  kind: 'legacy'
  position: ReaderPosition | null
}

export type ReaderSurfaceDocument
  = | BoundReaderSurfaceDocument
    | LegacyReaderSurfaceDocument
    | UnboundReaderSurfaceDocument

export interface ReadReaderRangeInput {
  length: number
  offset: number
  readingId: string
}

export interface SaveReaderStateInput {
  annotations: readonly ReaderAnnotation[]
  position: ReaderPosition | null
  readingId: string
}

export interface InitializeBookReaderNoteInput extends EditorNoteStorageProjection {
  noteId: string
  readingId: string
  snapshot: string
  title: string
  topicId: string
}

export interface SaveReaderNoteInput extends EditorNoteStorageProjection {
  noteId: string
  title: string
  updates: readonly string[]
}

export interface ReaderSurfaceFunctions {
  initializeBookNote: (input: InitializeBookReaderNoteInput) => Promise<void>
  readRange: (input: ReadReaderRangeInput) => Promise<string>
  saveNote: (input: SaveReaderNoteInput) => Promise<void>
  saveState: (input: SaveReaderStateInput) => Promise<void>
}
