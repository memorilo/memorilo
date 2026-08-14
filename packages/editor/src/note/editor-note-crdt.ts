import type { BookFileBinding } from '@memorilo/reading-model'
import type { LoroDoc, LoroMap } from 'loro-crdt'
import { assertBookFileBinding } from '@memorilo/reading-model'

export const NOTE_META_KEY = 'noteMeta'
export const NOTE_ENTRIES_KEY = 'entries'
export const NOTE_SCHEMA_VERSION = 4
export const NOTE_UNDO_BOUNDARY_KEY = 'undoBoundary'
export const ENTRY_ID_KEY = 'entryId'
export const ENTRY_KIND_KEY = 'kind'
export const FOLDER_NAME_KEY = 'name'
export const TOPIC_TITLE_KEY = 'title'
export const TOPIC_EDITOR_MODE_KEY = 'editorMode'
export const TOPIC_BLOCK_TREE_KEY = 'blockTreeKey'
export const TOPIC_TYPE_KEY = 'topicType'
export const IMAGE_OCCLUSION_STATE_KEY = 'imageOcclusion'
export const BOOK_BINDING_KEY = 'book'
export const BOOK_READING_STATE_KEY = 'readingStateKey'
export const BOOK_ANNOTATIONS_KEY = 'annotationsKey'

export function readString(map: LoroMap, key: string, description: string): string {
  const value = map.get(key)
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${description} must be a non-empty string`)
  return value
}

export function readTopicTitle(map: LoroMap, description: string): string {
  const value = map.get(TOPIC_TITLE_KEY)
  if (typeof value !== 'string')
    throw new Error(`${description} must be a string`)
  return value
}

export function readTopicType(map: LoroMap, description: string): 'book' | 'image-occlusion' | 'regular' {
  const value = map.get(TOPIC_TYPE_KEY)
  if (value !== 'book' && value !== 'image-occlusion' && value !== 'regular')
    throw new Error(`${description} must be "book", "image-occlusion", or "regular"`)
  return value
}

export function validateBookBindingValue(value: unknown, description: string): BookFileBinding {
  const binding = structuredClone(value) as BookFileBinding
  assertBookFileBinding(binding, description)
  return binding
}

export function readBookBinding(map: LoroMap, description: string): BookFileBinding {
  return validateBookBindingValue(map.get(BOOK_BINDING_KEY), description)
}

export function noteTree(doc: LoroDoc) {
  return doc.getTree(NOTE_ENTRIES_KEY)
}

export function findNoteEntry(doc: LoroDoc, entryId: string) {
  const normalizedId = entryId.trim()
  if (normalizedId.length === 0)
    throw new TypeError('Note entry id must be a non-empty string')
  const node = noteTree(doc).getNodes().find(candidate => candidate.data.get(ENTRY_ID_KEY) === normalizedId)
  if (!node)
    throw new Error(`Unknown NoteEntry: ${normalizedId}`)
  return node
}
