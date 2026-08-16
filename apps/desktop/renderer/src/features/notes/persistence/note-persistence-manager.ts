import type { DesktopNoteWriteReceipt, SaveDesktopNoteUpdatesInput } from '@memorilo/desktop-preload'
import type { EditorNoteChange } from '@memorilo/editor'
import { createResourceScope, toError } from '@memorilo/effect-lifecycle'
import { Effect, Exit, FiberHandle, Scope } from 'effect'

export interface NotePersistenceAdapter {
  saveNoteUpdates: (input: SaveDesktopNoteUpdatesInput) => Promise<DesktopNoteWriteReceipt>
}

export interface NotePersistenceState {
  pendingNoteIds: readonly string[]
  saving: boolean
}

export interface NotePersistenceManagerOptions {
  adapter: NotePersistenceAdapter
  debounceMs?: number
  onListenerError?: (error: unknown) => void
}

export class NotePersistenceManager {
  readonly #adapter: NotePersistenceAdapter
  readonly #debounceHandle: FiberHandle.FiberHandle<void, never>
  readonly #debounceMs: number
  readonly #debounceScope: Scope.Closeable
  readonly #listeners = new Set<() => void>()
  readonly #onListenerError: ((error: unknown) => void) | undefined
  readonly #errors = new Map<string, Error>()
  readonly #queues = new Map<string, EditorNoteChange[]>()
  readonly #receiptListeners = new Set<(noteId: string, receipt: DesktopNoteWriteReceipt) => void>()
  readonly #replacementGenerations = new Map<string, number>()
  readonly #resources = createResourceScope('Note persistence manager', {
    closeMode: 'dependent',
  })

  readonly #runDebounce: (effect: Effect.Effect<void>) => Promise<void>
  #flushPromise: Promise<void> | undefined
  #saving = false
  #state: NotePersistenceState = { pendingNoteIds: [], saving: false }

  constructor({
    adapter,
    debounceMs = 250,
    onListenerError,
  }: NotePersistenceManagerOptions) {
    this.#adapter = adapter
    this.#debounceMs = debounceMs
    this.#onListenerError = onListenerError
    this.#debounceScope = Scope.makeUnsafe('sequential')
    this.#debounceHandle = Effect.runSync(Scope.provide(
      FiberHandle.make<void, never>(),
      this.#debounceScope,
    ))
    this.#runDebounce = Effect.runSync(FiberHandle.runtimePromise(this.#debounceHandle)<never>())
    this.#resources.own({
      close: () => Effect.runPromise(Scope.close(this.#debounceScope, Exit.void)),
      name: 'debounce timer',
    })
    this.#resources.own({
      close: () => this.#startFlush(false),
      name: 'pending Note updates',
    })
    this.#resources.own({
      close: () => {
        this.#listeners.clear()
        this.#receiptListeners.clear()
      },
      name: 'persistence listeners',
    })
    this.#resources.commit()
  }

  readonly close = (): Promise<void> => this.#resources.close()

  readonly enqueue = (change: EditorNoteChange): void => {
    this.#assertOpen()
    const queued = this.#queues.get(change.noteId) ?? []
    queued.push(change)
    this.#queues.set(change.noteId, queued)
    if (!this.#saving)
      this.#schedule()
    this.#notify()
  }

  readonly replacePending = (change: EditorNoteChange): void => {
    this.#assertOpen()
    this.#replacementGenerations.set(
      change.noteId,
      (this.#replacementGenerations.get(change.noteId) ?? 0) + 1,
    )
    this.#queues.set(change.noteId, [change])
    if (!this.#saving)
      this.#schedule()
    this.#notify()
  }

  readonly flush = (): Promise<void> => {
    return this.#resources.isClosed() ? this.close() : this.#startFlush(true)
  }

  readonly getError = (noteId: string): Error | null => {
    return this.#errors.get(noteId) ?? null
  }

  readonly getPendingChanges = (noteId: string): readonly EditorNoteChange[] => {
    return [...(this.#queues.get(noteId) ?? [])]
  }

  readonly getSnapshot = (): NotePersistenceState => this.#state

  readonly retry = (): Promise<void> => this.flush()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#assertOpen()
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  readonly subscribeReceipts = (
    listener: (noteId: string, receipt: DesktopNoteWriteReceipt) => void,
  ): (() => void) => {
    this.#assertOpen()
    this.#receiptListeners.add(listener)
    return () => this.#receiptListeners.delete(listener)
  }

  #assertOpen(): void {
    if (this.#resources.isClosed())
      throw new Error('Note persistence manager is closed')
  }

  #drain(): Effect.Effect<void, Error> {
    return Effect.gen({ self: this }, function* () {
      this.#saving = true
      this.#notify()
      yield* Effect.sleep(0)

      while (true) {
        if (this.#queues.size === 0) {
          yield* Effect.sleep(0)
          if (this.#queues.size === 0)
            break
        }

        const entry = this.#queues.entries().next().value
        if (!entry)
          continue
        const [noteId, queued] = entry
        const replacementGeneration = this.#replacementGenerations.get(noteId) ?? 0
        this.#queues.delete(noteId)

        const receipt = yield* Effect.tryPromise({
          catch: toError,
          try: () => this.#adapter.saveNoteUpdates({
            noteId,
            updates: queued.map(change => change.update),
          }),
        }).pipe(Effect.catchEager((cause) => {
          if ((this.#replacementGenerations.get(noteId) ?? 0) === replacementGeneration) {
            this.#queues.set(noteId, [...queued, ...(this.#queues.get(noteId) ?? [])])
          }
          this.#errors.set(noteId, cause)
          return Effect.fail(cause)
        }))

        this.#errors.delete(noteId)
        if (!this.#queues.has(noteId)
          && (this.#replacementGenerations.get(noteId) ?? 0) === replacementGeneration) {
          this.#replacementGenerations.delete(noteId)
        }
        this.#publish(this.#receiptListeners, noteId, receipt)
      }
    }).pipe(Effect.ensuring(Effect.sync(() => {
      this.#saving = false
      this.#notify()
    })))
  }

  #notify(): void {
    this.#state = {
      pendingNoteIds: [...this.#queues.keys()],
      saving: this.#saving,
    }
    this.#publish(this.#listeners)
  }

  #publish<Arguments extends readonly unknown[]>(
    subscribers: ReadonlySet<(...arguments_: Arguments) => void>,
    ...arguments_: Arguments
  ): void {
    for (const subscriber of [...subscribers]) {
      try {
        subscriber(...arguments_)
      }
      catch (listenerError) {
        this.#reportListenerError(listenerError)
      }
    }
  }

  #reportListenerError(listenerError: unknown): void {
    try {
      if (this.#onListenerError) {
        this.#onListenerError(listenerError)
        return
      }
      console.error('Note persistence listener failed', listenerError)
    }
    catch (reportError) {
      console.error('Note persistence listener error reporting failed', reportError)
    }
  }

  #schedule(): void {
    const scheduled = this.#runDebounce(Effect.sleep(this.#debounceMs).pipe(
      Effect.andThen(Effect.sync(() => {
        const flush = this.#startFlush(false)
        void flush.then(undefined, () => undefined)
      })),
    ))
    void scheduled.then(undefined, () => undefined)
  }

  #startFlush(interruptDebounce: boolean): Promise<void> {
    if (this.#flushPromise)
      return this.#flushPromise

    const drain = interruptDebounce
      ? FiberHandle.clear(this.#debounceHandle).pipe(Effect.andThen(this.#drain()))
      : this.#drain()
    const current = Effect.runPromise(drain)
    this.#flushPromise = current
    void current.then(
      () => {
        if (this.#flushPromise === current)
          this.#flushPromise = undefined
      },
      () => {
        if (this.#flushPromise === current)
          this.#flushPromise = undefined
      },
    )
    return current
  }
}
