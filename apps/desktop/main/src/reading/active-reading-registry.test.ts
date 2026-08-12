import type { ActiveReadingOwner } from './active-reading-registry'
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { createActiveReadingRegistry } from './active-reading-registry'

class TestOwner implements ActiveReadingOwner {
  private destroyed = false
  private readonly events = new EventEmitter()
  private removalFailures = 0

  destroy(): void {
    this.destroyed = true
    this.events.emit('destroyed')
  }

  failNextRemoval(): void {
    this.removalFailures += 1
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  listenerCount(event: 'destroyed'): number {
    return this.events.listenerCount(event)
  }

  once(event: 'destroyed', listener: () => void): this {
    this.events.once(event, listener)
    return this
  }

  removeListener(event: 'destroyed', listener: () => void): this {
    if (this.removalFailures > 0) {
      this.removalFailures -= 1
      throw new Error('listener removal failed')
    }
    this.events.removeListener(event, listener)
    return this
  }
}

function reading(owner: ActiveReadingOwner, suffix: string) {
  return {
    input: {
      noteId: `note-${suffix}`,
      readingId: `reading-${suffix}`,
      topicId: `topic-${suffix}`,
    },
    owner,
  }
}

describe('active reading registry', () => {
  it('releases all sessions when their renderer owner is destroyed', () => {
    const registry = createActiveReadingRegistry()
    const firstOwner = new TestOwner()
    const secondOwner = new TestOwner()
    registry.begin(reading(firstOwner, 'first').input, firstOwner)
    registry.begin(reading(firstOwner, 'second').input, firstOwner)
    registry.begin(reading(secondOwner, 'third').input, secondOwner)

    expect(firstOwner.listenerCount('destroyed')).toBe(1)
    expect(registry.isReadingIdActive('reading-first')).toBe(true)
    expect(registry.isReadingIdActive('reading-third')).toBe(true)

    firstOwner.destroy()

    expect(registry.isReadingIdActive('reading-first')).toBe(false)
    expect(registry.isReadingIdActive('reading-second')).toBe(false)
    expect(registry.isReadingIdActive('reading-third')).toBe(true)
  })

  it('allows only the owning renderer to end a session', () => {
    const registry = createActiveReadingRegistry()
    const owner = new TestOwner()
    const other = new TestOwner()
    const session = registry.begin(reading(owner, 'owned').input, owner)

    expect(registry.end(session.id, other)).toBe(false)
    expect(registry.isReadingIdActive('reading-owned')).toBe(true)
    expect(registry.end(session.id, owner)).toBe(true)
    expect(registry.isReadingIdActive('reading-owned')).toBe(false)
    expect(owner.listenerCount('destroyed')).toBe(0)
  })

  it('keeps the last session registered when listener removal fails so end can retry', () => {
    const registry = createActiveReadingRegistry()
    const owner = new TestOwner()
    const session = registry.begin(reading(owner, 'retry').input, owner)
    owner.failNextRemoval()

    expect(() => registry.end(session.id, owner)).toThrow('listener removal failed')
    expect(registry.isReadingIdActive('reading-retry')).toBe(true)
    expect(owner.listenerCount('destroyed')).toBe(1)

    expect(registry.end(session.id, owner)).toBe(true)
    expect(registry.isReadingIdActive('reading-retry')).toBe(false)
    expect(owner.listenerCount('destroyed')).toBe(0)
  })

  it('detaches owner listeners on close and rejects later sessions', async () => {
    const registry = createActiveReadingRegistry()
    const owner = new TestOwner()
    registry.begin(reading(owner, 'active').input, owner)

    const firstClose = registry.close()
    expect(registry.close()).toBe(firstClose)
    await firstClose

    expect(owner.listenerCount('destroyed')).toBe(0)
    expect(registry.isReadingIdActive('reading-active')).toBe(false)
    expect(() => registry.begin(reading(owner, 'late').input, owner)).toThrow('closed')
  })

  it('clears sessions while retaining failed listener cleanup for a close retry', async () => {
    const registry = createActiveReadingRegistry()
    const owner = new TestOwner()
    registry.begin(reading(owner, 'retry-close').input, owner)
    owner.failNextRemoval()

    const firstClose = registry.close()
    expect(registry.close()).toBe(firstClose)
    await expect(firstClose).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'listener removal failed' }),
      message: 'Failed to close renderer owner listeners',
    })
    expect(registry.isReadingIdActive('reading-retry-close')).toBe(false)
    expect(owner.listenerCount('destroyed')).toBe(1)

    await expect(registry.close()).resolves.toBeUndefined()
    expect(owner.listenerCount('destroyed')).toBe(0)
  })

  it('rejects an owner that was already destroyed', () => {
    const registry = createActiveReadingRegistry()
    const owner = new TestOwner()
    owner.destroy()

    expect(() => registry.begin(reading(owner, 'late').input, owner)).toThrow('destroyed')
    expect(registry.isReadingIdActive('reading-late')).toBe(false)
  })
})
