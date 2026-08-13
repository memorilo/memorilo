import { randomUUID } from 'node:crypto'
import { createResourceScope, runLifecycleOperations } from '@memorilo/effect-lifecycle'

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

export interface ActiveReadingOwner {
  isDestroyed: () => boolean
  once: (event: 'destroyed', listener: () => void) => unknown
  removeListener: (event: 'destroyed', listener: () => void) => unknown
}

interface OwnedReadingSession {
  owner: ActiveReadingOwner
  session: ActiveReadingSession
}

interface OwnerRegistration {
  destroyed: () => void
  sessionIds: Set<string>
}

function assertNonEmpty(value: string, description: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
}

export function createActiveReadingRegistry() {
  const sessions = new Map<string, OwnedReadingSession>()
  const owners = new Map<ActiveReadingOwner, OwnerRegistration>()
  const resources = createResourceScope('Active reading registry', {
    closeMode: 'dependent',
  })

  const assertOpenOwner = (owner: ActiveReadingOwner): void => {
    if (resources.isClosed())
      throw new Error('Active reading registry is closed')
    if (owner.isDestroyed())
      throw new Error('Active reading renderer owner is destroyed')
  }

  const registerOwner = (owner: ActiveReadingOwner): OwnerRegistration => {
    const existing = owners.get(owner)
    if (existing)
      return existing
    const registration: OwnerRegistration = {
      destroyed: () => {
        const current = owners.get(owner)
        if (current !== registration)
          return
        owners.delete(owner)
        for (const sessionId of registration.sessionIds)
          sessions.delete(sessionId)
        registration.sessionIds.clear()
      },
      sessionIds: new Set(),
    }
    owner.once('destroyed', registration.destroyed)
    owners.set(owner, registration)
    return registration
  }

  resources.own({
    close: async () => {
      try {
        await runLifecycleOperations(
          [...owners].map(([owner, registration]) => () => {
            owner.removeListener('destroyed', registration.destroyed)
            owners.delete(owner)
            registration.sessionIds.clear()
          }),
          'Active reading registry shutdown failed',
        )
      }
      finally {
        // Sessions are registry state, while failed owner registrations are
        // retained above so a later close can retry listener removal.
        sessions.clear()
      }
    },
    name: 'renderer owner listeners',
  })
  resources.commit()

  return {
    begin: (input: BeginActiveReadingInput, owner: ActiveReadingOwner): ActiveReadingSession => {
      assertNonEmpty(input.noteId, 'Active reading Note id')
      assertNonEmpty(input.readingId, 'Active reading file locator')
      assertNonEmpty(input.topicId, 'Active reading BookTopic id')
      assertOpenOwner(owner)
      const session = { ...structuredClone(input), id: randomUUID() }
      const registration = registerOwner(owner)
      registration.sessionIds.add(session.id)
      sessions.set(session.id, { owner, session })
      return structuredClone(session)
    },
    close: resources.close,
    end: (sessionId: string, owner: ActiveReadingOwner): boolean => {
      assertNonEmpty(sessionId, 'Active reading session id')
      const owned = sessions.get(sessionId)
      if (!owned || owned.owner !== owner)
        return false
      const registration = owners.get(owner)
      if (registration?.sessionIds.size === 1) {
        owner.removeListener('destroyed', registration.destroyed)
        owners.delete(owner)
      }
      sessions.delete(sessionId)
      registration?.sessionIds.delete(sessionId)
      return true
    },
    isNoteActive: (noteId: string): boolean => {
      assertNonEmpty(noteId, 'Note id')
      return [...sessions.values()].some(({ session }) => session.noteId === noteId)
    },
    isReadingIdActive: (readingId: string): boolean => {
      assertNonEmpty(readingId, 'Shelf reading id')
      return [...sessions.values()].some(({ session }) => session.readingId === readingId)
    },
    topicIdsForNote: (noteId: string): ReadonlySet<string> => {
      assertNonEmpty(noteId, 'Note id')
      return new Set([...sessions.values()]
        .filter(({ session }) => session.noteId === noteId)
        .map(({ session }) => session.topicId))
    },
  }
}

export type ActiveReadingRegistry = ReturnType<typeof createActiveReadingRegistry>
