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
  tagStorage: EditorTagStorage
  uploadImage: (input: ImageUploadInput) => Promise<string>
}
