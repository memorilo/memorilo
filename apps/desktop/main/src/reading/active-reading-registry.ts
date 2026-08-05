import { randomUUID } from 'node:crypto'

export interface ActiveReadingSession {
  id: string
  noteId: string
  readingId: string
  topicId: string
}

export interface BeginActiveReadingInput {
  noteId: string
  readingId: string
  topicId: string
}

function assertNonEmpty(value: string, description: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
}

export function createActiveReadingRegistry() {
  const sessions = new Map<string, ActiveReadingSession>()

  return {
    begin: (input: BeginActiveReadingInput): ActiveReadingSession => {
      assertNonEmpty(input.noteId, 'Active reading Note id')
      assertNonEmpty(input.readingId, 'Active reading file locator')
      assertNonEmpty(input.topicId, 'Active reading BookTopic id')
      const session = { ...structuredClone(input), id: randomUUID() }
      sessions.set(session.id, session)
      return structuredClone(session)
    },
    end: (sessionId: string): boolean => {
      assertNonEmpty(sessionId, 'Active reading session id')
      return sessions.delete(sessionId)
    },
    isNoteActive: (noteId: string): boolean => {
      assertNonEmpty(noteId, 'Note id')
      return [...sessions.values()].some(session => session.noteId === noteId)
    },
    isReadingIdActive: (readingId: string): boolean => {
      assertNonEmpty(readingId, 'Shelf reading id')
      return [...sessions.values()].some(session => session.readingId === readingId)
    },
    topicIdsForNote: (noteId: string): ReadonlySet<string> => {
      assertNonEmpty(noteId, 'Note id')
      return new Set([...sessions.values()]
        .filter(session => session.noteId === noteId)
        .map(session => session.topicId))
    },
  }
}

export type ActiveReadingRegistry = ReturnType<typeof createActiveReadingRegistry>
