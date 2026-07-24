export interface EditorUser {
  id: number
  name: string
}

export interface EditorTag {
  id: number
  label: string
}

export interface ImageUploadInput {
  file: File
  onProgress: (progress: { loaded: number, total: number }) => void
}

export interface EditorAdapters {
  users: readonly EditorUser[]
  tags: readonly EditorTag[]
  uploadImage: (input: ImageUploadInput) => Promise<string>
}
