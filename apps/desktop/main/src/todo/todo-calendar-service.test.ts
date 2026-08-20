import type { EditorStorage, TodoCalendarSubscription } from '@memorilo/editor-storage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTodoCalendarService } from './todo-calendar-service'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('todo calendar service', () => {
  it('normalizes timed ICS events to the desktop date-time contract', async () => {
    type SaveSnapshotInput = Parameters<EditorStorage['todoCalendars']['saveSnapshot']>[0]
    let subscription: TodoCalendarSubscription | null = null
    const snapshots: SaveSnapshotInput[] = []
    const todoCalendars = {
      ensureSubscription: vi.fn(async (input: { id: string, title: string, url: string }) => {
        subscription = {
          enabled: true,
          etag: null,
          fetchedAt: null,
          id: input.id,
          lastModified: null,
          title: input.title,
          url: input.url,
          version: null,
        }
      }),
      listSubscriptions: vi.fn(async () => subscription === null ? [] : [subscription]),
      saveSnapshot: vi.fn(async (input: SaveSnapshotInput) => {
        snapshots.push(input)
        if (subscription !== null)
          subscription = { ...subscription, fetchedAt: input.fetchedAt, version: input.version }
      }),
    }
    const storage = { todoCalendars } as unknown as EditorStorage
    vi.stubGlobal('fetch', vi.fn(async () => new Response([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:timed-event',
      'SUMMARY:Timed event',
      'DTSTART:20260820T091530Z',
      'DTEND:20260820T104500Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'), { status: 200 })))

    await createTodoCalendarService(storage, () => 'en').subscribe({
      title: 'Work',
      url: 'https://example.com/work.ics',
    })

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.events).toEqual([expect.objectContaining({
      allDay: false,
      endAt: '2026-08-20T10:45',
      startAt: '2026-08-20T09:15',
      title: 'Timed event',
    })])
  })
})
