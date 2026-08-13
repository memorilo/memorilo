import { describe, expect, it } from 'vitest'
import { EditorMode } from '../common/editor-mode'
import { createEditorNote } from './editor-note'

describe('editor Note entry repository', () => {
  it('keeps tree ownership coherent across promote, move, rename, and subtree deletion', () => {
    const note = createEditorNote({ id: 'entry-note' })
    const folderId = note.createFolder({ index: 0, name: 'Drafts' })
    const promotedTopicId = note.createTopic({
      mode: EditorMode.Document,
      parentId: folderId,
      title: 'Promote me',
    })

    note.renameEntry(folderId, 'Research')
    note.renameEntry(promotedTopicId, 'Promoted')
    note.deleteEntry({ entryId: folderId, strategy: 'promote-children' })

    expect(note.getEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: promotedTopicId, parentId: null, title: 'Promoted' }),
    ]))

    const removableFolderId = note.createFolder({ name: 'Remove' })
    const removableTopicId = note.createTopic({
      mode: EditorMode.Outline,
      parentId: removableFolderId,
      title: 'Remove me',
    })
    note.moveEntry({ entryId: promotedTopicId, index: 0, parentId: removableFolderId })
    expect(note.getEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: promotedTopicId, ordinal: 0, parentId: removableFolderId }),
      expect.objectContaining({ id: removableTopicId, ordinal: 1, parentId: removableFolderId }),
    ]))

    note.deleteEntry({ entryId: removableFolderId, strategy: 'delete-subtree' })
    const remainingIds = note.getEntries().map(entry => entry.id)
    expect(remainingIds).not.toContain(promotedTopicId)
    expect(remainingIds).not.toContain(removableTopicId)
  })

  it('does not publish partial CRDT state when an entry mutation fails validation', () => {
    const note = createEditorNote({ id: 'atomic-entry-note' })
    const beforeEntries = note.getEntries()
    const beforeVersion = note.getVersion()

    expect(() => note.createFolder({ index: -1, name: 'Invalid' })).toThrow('non-negative integer')
    expect(() => note.createFolder({ name: '  ' })).toThrow('non-empty string')

    expect(note.getEntries()).toEqual(beforeEntries)
    expect(note.getVersion()).toEqual(beforeVersion)
  })
})
