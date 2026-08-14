import { LoroDoc } from 'loro-crdt'
import { describe, expect, it } from 'vitest'
import {
  createWhiteboardLibraryDocument,
  whiteboardLibrarySchemaVersion,
} from './whiteboard-library-document'

const firstItem = {
  created: 100,
  elements: [{
    height: 60,
    id: 'rectangle-1',
    isDeleted: false,
    link: null,
    type: 'rectangle',
    width: 80,
    x: 10,
    y: 20,
  }],
  id: 'library-item-1',
  name: 'Reference card',
  status: 'unpublished' as const,
}

const secondItem = {
  created: 200,
  elements: [{
    height: 2,
    id: 'line-1',
    isDeleted: false,
    link: null,
    type: 'line',
    width: 120,
    x: 30,
    y: 40,
  }],
  id: 'library-item-2',
  status: 'published' as const,
}

describe('whiteboard library Loro document', () => {
  it('exports a versioned Loro snapshot and restores ordered library items', () => {
    const library = createWhiteboardLibraryDocument()
    library.replaceItems([secondItem, firstItem])

    const snapshot = library.exportSnapshot()
    const decoded = new LoroDoc()
    decoded.import(snapshot)

    expect(decoded.getMap('whiteboardLibraryMeta').get('schemaVersion')).toBe(
      whiteboardLibrarySchemaVersion,
    )
    expect(decoded.getMovableList('whiteboardLibraryItemOrder').toJSON()).toEqual([
      'library-item-2',
      'library-item-1',
    ])
    expect(decoded.getMap('whiteboardLibraryItems').toJSON()).toEqual({
      'library-item-1': firstItem,
      'library-item-2': secondItem,
    })

    const restored = createWhiteboardLibraryDocument({ snapshot })
    expect(restored.getItems()).toEqual([secondItem, firstItem])
  })

  it('rejects an unsupported stored schema version', () => {
    const invalid = new LoroDoc()
    invalid.getMap('whiteboardLibraryMeta').set('schemaVersion', 2)
    invalid.commit({ origin: 'test:invalid-schema' })

    expect(() => createWhiteboardLibraryDocument({
      snapshot: new Uint8Array(invalid.export({ mode: 'snapshot' })),
    })).toThrow('Unsupported Whiteboard Library schema version: 2')
  })

  it('rejects duplicate item identities without mutating the document', () => {
    const library = createWhiteboardLibraryDocument()
    library.replaceItems([firstItem])
    const before = library.exportSnapshot()

    expect(() => library.replaceItems([firstItem, firstItem])).toThrow(
      'Whiteboard Library item ids must be unique',
    )
    expect(library.exportSnapshot()).toEqual(before)
    expect(library.getItems()).toEqual([firstItem])
  })
})
