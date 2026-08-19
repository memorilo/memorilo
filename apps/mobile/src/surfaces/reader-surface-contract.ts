import type { EditorNoteStorageProjection } from '@memorilo/application/note-storage'
import type { ReaderAnnotation, ReaderPosition } from '@memorilo/editor/reader'
import type { BookFileBinding, ReadingFormat } from '@memorilo/reading-model'
import type { EditorSurfaceSession } from './editor-surface-contract'

interface ReaderSurfaceDocumentBase {
  byteLength: number
  fileUri: string
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
  book: BookFileBinding
  kind: 'unbound'
  noteTitle: string
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

export interface SaveReaderStateInput {
  annotations: readonly ReaderAnnotation[]
  position: ReaderPosition | null
  readingId: string
}

export interface ReaderCaptureRegionInput {
  height: number
  width: number
  x: number
  y: number
}

export interface SaveReaderImageInput {
  data: string
  fileName: string
  mimeType: string
}

export interface SavedReaderImage {
  src: string
}

export interface ReaderImageSize {
  height: number
  width: number
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

export interface ReaderSurfaceCommand {
  id: number
  type: 'flush'
}

export interface ReaderSurfaceCommandResult {
  commandId: number
  error?: string
}

export interface ReaderSurfaceFunctions {
  captureReaderRegion: (input: ReaderCaptureRegionInput) => Promise<string>
  readImageSize: (source: string) => Promise<ReaderImageSize>
  resolveAsset: (source: string) => Promise<string>
  saveImage: (input: SaveReaderImageInput) => Promise<SavedReaderImage>
  saveNote: (input: SaveReaderNoteInput) => Promise<void>
  saveState: (input: SaveReaderStateInput) => Promise<void>
}

export interface ReaderSurfaceTopicInput {
  noteId: string
  topicId: string
}
