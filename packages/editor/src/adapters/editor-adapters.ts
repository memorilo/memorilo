import type { TaskCalendarAdapter } from '../task/task-calendar'

export interface EditorTag {
  id: string
  label: string
}

export interface EditorTagStorage {
  search: (input: { query: string }) => Promise<readonly EditorTag[]>
  create: (tag: EditorTag) => Promise<EditorTag>
  update: (tag: EditorTag) => Promise<EditorTag>
}

export interface ImageUploadInput {
  file: File
  onProgress: (progress: { loaded: number, total: number }) => void
}

export interface EditorAdapters {
  importNetworkImage?: (source: string) => Promise<string>
  networkImagePasteBehavior?: 'download' | 'url'
  tagStorage: EditorTagStorage
  taskCalendar?: TaskCalendarAdapter
  uploadImage: (input: ImageUploadInput) => Promise<string>
}
