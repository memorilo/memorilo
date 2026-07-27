import type { EditorAdapters, EditorTag, EditorTagStorage } from './editor-adapters'

function normalizeForComparison(label: string) {
  return label.toLocaleLowerCase()
}

function createDemoTagStorage(initialTags: readonly EditorTag[]): EditorTagStorage {
  let tags = [...initialTags]

  return {
    search: async ({ query }) => {
      const normalizedQuery = normalizeForComparison(query)
      return tags.filter(tag => normalizeForComparison(tag.label).includes(normalizedQuery))
    },
    create: async (tag) => {
      const existing = tags.find(item => normalizeForComparison(item.label) === normalizeForComparison(tag.label))
      if (existing)
        return existing
      if (tags.some(item => item.id === tag.id))
        throw new Error(`A tag with id ${tag.id} already exists`)

      tags = [...tags, tag]
      return tag
    },
    update: async (tag) => {
      const index = tags.findIndex(item => item.id === tag.id)
      if (index === -1)
        throw new Error(`Tag ${tag.id} does not exist`)
      if (tags.some(item => item.id !== tag.id && normalizeForComparison(item.label) === normalizeForComparison(tag.label)))
        throw new Error(`Tag #${tag.label} already exists`)

      tags = tags.map((item, itemIndex) => itemIndex === index ? tag : item)
      return tag
    },
  }
}

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
  tagStorage: createDemoTagStorage([
    { id: 'tag-research', label: 'research' },
    { id: 'tag-reading', label: 'reading' },
    { id: 'tag-project', label: 'project' },
    { id: 'tag-idea', label: 'idea' },
  ]),
  uploadImage: readImageAsDataUrl,
}
