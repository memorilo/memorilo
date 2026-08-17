import type { EditorNoteStorageProjection } from '@memorilo/application/note-storage'

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

export type EditorSurfaceCommand = {
  id: number
  type: 'flush'
} | {
  id: number
  title: string
  type: 'rename-note'
}

export interface EditorSurfaceCommandResult {
  commandId: number
  error?: string
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
