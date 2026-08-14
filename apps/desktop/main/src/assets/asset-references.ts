import type { AssetReferenceProjection } from '@memorilo/editor-storage'
import type { EditorNote } from '@memorilo/editor/note'

import { parseAssetFileName } from './asset-uri'

interface AssetNode {
  attrs?: Readonly<Record<string, unknown>>
  content?: readonly AssetNode[]
  type: string
}

export { assetFileNamePattern } from './asset-uri'

function collectAssetReferences(node: AssetNode, counts: Map<string, number>): void {
  if (node.type === 'image') {
    const src = node.attrs?.src
    if (typeof src === 'string') {
      const fileName = parseAssetFileName(src)
      if (fileName)
        counts.set(fileName, (counts.get(fileName) ?? 0) + 1)
    }
  }
  node.content?.forEach(child => collectAssetReferences(child, counts))
}

export function projectNoteAssetReferences(note: EditorNote): readonly AssetReferenceProjection[] {
  const counts = new Map<string, number>()
  for (const entry of note.getEntries()) {
    if (entry.kind !== 'topic')
      continue
    if (entry.topicType === 'image-occlusion') {
      collectAssetReferences({
        attrs: { src: note.getImageOcclusionTopic(entry.id).getState().image.src },
        type: 'image',
      }, counts)
      continue
    }
    const validation = note.getTopicValidationInput(entry.id)
    if ('document' in validation) {
      collectAssetReferences(validation.document, counts)
      continue
    }
    if ('embeddedEditors' in validation)
      Object.values(validation.embeddedEditors).forEach(editor => collectAssetReferences(editor.document, counts))
  }
  return [...counts].map(([fileName, count]) => ({ count, fileName }))
}
