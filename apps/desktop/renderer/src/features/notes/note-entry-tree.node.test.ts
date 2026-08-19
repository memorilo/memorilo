import type { FolderSnapshot, NoteEntrySnapshot, RegularTopicSnapshot } from '@memorilo/editor'
import { projectVisibleNoteEntries } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'

function folder(id: string, parentId: string | null = null): FolderSnapshot {
  return { id, kind: 'folder', name: id, ordinal: 0, parentId }
}

function topic(id: string, parentId: string | null = null): RegularTopicSnapshot {
  return { id, kind: 'topic', mode: 0, ordinal: 0, parentId, title: id, topicType: 'regular' }
}

describe('note entry tree projection', () => {
  it('projects depth and child state while hiding every collapsed descendant', () => {
    const entries = [folder('root'), folder('nested', 'root'), topic('hidden', 'nested'), topic('visible')]

    expect(projectVisibleNoteEntries(entries, new Set(['root']))).toEqual([
      { depth: 0, entry: entries[0], hasChildren: true },
      { depth: 0, entry: entries[3], hasChildren: false },
    ])
  })

  it('rejects duplicate ids and unknown parents', () => {
    expect(() => projectVisibleNoteEntries([folder('same'), topic('same')], new Set()))
      .toThrow('Duplicate Note entry id: same')
    expect(() => projectVisibleNoteEntries([topic('orphan', 'missing')], new Set()))
      .toThrow('Note entry orphan has unknown parent missing')
  })

  it('rejects cycles before producing a partial projection', () => {
    const entries: NoteEntrySnapshot[] = [folder('one', 'two'), folder('two', 'one')]

    expect(() => projectVisibleNoteEntries(entries, new Set())).toThrow('Cycle detected at Note entry one')
  })
})
