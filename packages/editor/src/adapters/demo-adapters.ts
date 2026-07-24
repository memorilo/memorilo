import type { EditorAdapters } from './editor-adapters'

function readImageAsDataUrl({ file, onProgress }: Parameters<EditorAdapters['uploadImage']>[0]) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    const total = Math.max(file.size, 1)

    reader.addEventListener('error', () => reject(new Error(`Unable to read ${file.name}`)))
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Unable to encode ${file.name}`))
        return
      }

      onProgress({ loaded: total, total })
      resolve(reader.result)
    })
    onProgress({ loaded: 0, total })
    reader.readAsDataURL(file)
  })
}

export const demoEditorAdapters: EditorAdapters = {
  tags: [
    { id: 1, label: 'research' },
    { id: 2, label: 'reading' },
    { id: 3, label: 'project' },
    { id: 4, label: 'idea' },
  ],
  uploadImage: readImageAsDataUrl,
  users: [
    { id: 1, name: 'Alex' },
    { id: 2, name: 'Mira' },
    { id: 3, name: 'Sam' },
    { id: 4, name: 'Taylor' },
  ],
}
