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
    if (entry.kind === 'topic')
      collectAssetReferences(note.getTopicValidationInput(entry.id).document, counts)
  }
  return [...counts].map(([fileName, count]) => ({ count, fileName }))
}
