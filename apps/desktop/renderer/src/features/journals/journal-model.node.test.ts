import type {
  DesktopJournalNote,
  DesktopJournalSummary,
} from '@memorilo/desktop-preload'
import { describe, expect, it } from 'vitest'
import {
  buildJournalFeed,
  journalSummary,
  validateJournalSearch,
} from './journal-model'

function summary(journalDate: string, version = 1): DesktopJournalSummary {
  return {
    createdAt: version,
    journalDate,
    kind: 'journal',
    noteId: `note-${journalDate}-${version}`,
    title: journalDate,
    topicId: `topic-${journalDate}-${version}`,
    updatedAt: version,
  }
}

function journal(journalDate: string, version = 1): DesktopJournalNote {
  return {
    createdAt: version,
    favorite: false,
    id: `note-${journalDate}-${version}`,
    journalDate,
    kind: 'journal',
    snapshot: new Uint8Array(),
    title: journalDate,
    topicId: `topic-${journalDate}-${version}`,
    updatedAt: version,
  }
}

describe('journal feed model', () => {
  it('validates an optional calendar date search parameter', () => {
    expect(validateJournalSearch({})).toEqual({})
    expect(validateJournalSearch({ date: '2026-08-08' })).toEqual({ date: '2026-08-08' })
    expect(() => validateJournalSearch({ date: 20260808 })).toThrow('must be a string')
    expect(() => validateJournalSearch({ date: '2026-02-30' })).toThrow('Invalid Journal date')
  })

  it('projects a stored Journal without retaining its snapshot', () => {
    expect(journalSummary(journal('2026-08-08'))).toEqual(summary('2026-08-08'))
  })

  it('deduplicates by date, keeps selected data over pages, and keeps today authoritative', () => {
    const feed = buildJournalFeed(
      journal('2026-08-08', 3),
      [{
        items: [
          summary('2026-08-08', 1),
          summary('2026-08-07', 1),
          summary('2026-08-06', 1),
        ],
        nextCursor: null,
      }],
      summary('2026-08-07', 2),
    )

    expect(feed).toEqual([
      summary('2026-08-08', 3),
      summary('2026-08-07', 2),
      summary('2026-08-06', 1),
    ])
  })
})
