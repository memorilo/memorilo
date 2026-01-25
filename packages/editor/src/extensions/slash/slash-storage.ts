import '@tiptap/core'

export interface SlashStorage {
  sessionActive: boolean
}

declare module '@tiptap/core' {
  interface Storage {
    slash: SlashStorage
  }
}
