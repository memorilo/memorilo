import type { DesktopNoteSearchHit } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import type { PaletteCommand } from '../../shared/command-palette'
import type { CommandPaletteNavigation } from './command-palette-search-model'
import { FileText } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { projectCommandPaletteSearch } from './command-palette-search-model'

type TopicSearchHit = Extract<DesktopNoteSearchHit, { kind: 'topic' }>
type RegularTopicSearchHit = Omit<TopicSearchHit, 'journalDate' | 'noteKind'> & { noteKind: 'regular' }

const t = ((key: string, options?: { query?: string }) => options?.query
  ? `${key}:${options.query}`
  : key) as TFunction

function command(overrides: Partial<PaletteCommand> = {}): PaletteCommand {
  return {
    accent: 'blue',
    action: 'open',
    description: 'Browse every Note',
    icon: FileText,
    id: 'open-pages',
    keywords: ['library'],
    label: 'Open Pages',
    run: vi.fn(),
    section: 'Navigation',
    ...overrides,
  }
}

function topicHit(overrides: Partial<RegularTopicSearchHit> = {}): RegularTopicSearchHit {
  return {
    blockId: 'block-1',
    kind: 'topic',
    match: 'semantic',
    noteId: 'note-1',
    noteKind: 'regular',
    noteTitle: 'Note',
    preview: 'Preview',
    rank: 0.9,
    topicId: 'topic-1',
    topicTitle: 'Topic',
    ...overrides,
  }
}

function navigation(): CommandPaletteNavigation {
  return {
    openJournal: vi.fn(async () => undefined),
    openNote: vi.fn(async () => undefined),
    openTopic: vi.fn(async () => undefined),
  }
}

function project(overrides: Partial<Parameters<typeof projectCommandPaletteSearch>[0]> = {}) {
  return projectCommandPaletteSearch({
    commands: [],
    createNote: vi.fn(),
    createNotePending: false,
    deferredQuery: 'query',
    hits: [],
    navigation: navigation(),
    normalizedQuery: 'query',
    searchError: false,
    searchFetching: false,
    selectedId: null,
    t,
    trimmedQuery: 'Query',
    ...overrides,
  })
}

describe('command palette search projection', () => {
  it('hides stale hits and creation while the deferred query catches up', () => {
    const state = project({
      deferredQuery: 'old query',
      hits: [topicHit({ match: 'content' })],
      normalizedQuery: 'new query',
    })

    expect(state.searchPending).toBe(true)
    expect(state.results).toEqual([])
    expect(state.selected).toBeUndefined()
  })

  it('offers creation for semantic-only results but not literal or command matches', () => {
    const createNote = vi.fn()
    const semantic = project({ createNote, hits: [topicHit()] })
    expect(semantic.results.map(result => result.id)).toEqual(['create-note', 'topic:note-1:topic-1'])
    semantic.results[0]?.run()
    expect(createNote).toHaveBeenCalledWith('Query')

    const literal = project({ hits: [topicHit({ match: 'content' })] })
    expect(literal.results.map(result => result.id)).toEqual(['topic:note-1:topic-1'])

    const matchingCommand = project({ commands: [command()], normalizedQuery: 'library', deferredQuery: 'library' })
    expect(matchingCommand.results.map(result => result.id)).toEqual(['open-pages'])
  })

  it('falls back to the first result and routes topic results through the navigation interface', async () => {
    const target = navigation()
    const state = project({
      hits: [topicHit({ blockId: 'block-9', noteId: 'note-9', topicId: 'topic-9' })],
      navigation: target,
      selectedId: 'missing-result',
    })

    expect(state.selected?.id).toBe('create-note')
    await state.results.at(-1)?.run()
    expect(target.openTopic).toHaveBeenCalledWith({
      blockId: 'block-9',
      noteId: 'note-9',
      topicId: 'topic-9',
    })
  })
})
