import { createEditorNote } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'
import { projectNoteAssetReferences } from './asset-references'

describe('note asset references', () => {
  it('counts Reader region snapshots stored on annotation Topics', () => {
    const note = createEditorNote({ id: 'reader-source-assets', title: 'Reader source assets' })
    const root = note.getEntries()[0]
    if (!root || root.kind !== 'topic')
      throw new Error('Expected the initial Topic')
    const fileName = '123e4567-e89b-42d3-a456-426614174000.png'
    note.createTopic({
      mode: 0,
      parentId: root.id,
      readerReference: {
        source: {
          imageSrc: `memorilo-asset:///${fileName}`,
          kind: 'region',
          location: 'Page 2',
        },
      },
      title: 'Region annotation',
    })

    expect(projectNoteAssetReferences(note)).toEqual([{ count: 1, fileName }])
  })
})
