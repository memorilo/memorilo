import type { EditorTag, EditorTagStorage } from '../adapters/editor-adapters'
import type { TagLabelError } from './tag-label'
import {
  createLatestOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import { getTagLabelError, normalizeTagLabel } from './tag-label'

type TagOperationAction = 'create' | 'update'
export type TagEditEntry = 'start' | 'end'

interface TagEditSubscription {
  getPosition: () => number | undefined
  listener: (entry: TagEditEntry) => void
}

export type TagOperationError = string | { tagLabelError: TagLabelError }

export type TagOperationSnapshot
  = | { status: 'idle' }
    | { status: 'saving', action: TagOperationAction }
    | { status: 'saved', action: TagOperationAction, canonicalTag: EditorTag }
    | { status: 'error', action: TagOperationAction, error: TagOperationError }

const idleSnapshot: TagOperationSnapshot = { status: 'idle' }

export class InvalidStoredTagError extends Error {
  constructor(readonly reason: TagLabelError) {
    super('Tag storage returned an invalid tag')
    this.name = 'InvalidStoredTagError'
  }
}

export class TagRuntimeClosedError extends Error {
  constructor() {
    super('Tag runtime is closed')
    this.name = 'TagRuntimeClosedError'
  }
}

function requireValidTag(tag: EditorTag) {
  const error = getTagLabelError(tag.label)
  if (error)
    throw new InvalidStoredTagError(error)
  if (!tag.id)
    throw new Error('Tag storage returned a tag without an id')
  return { ...tag, label: normalizeTagLabel(tag.label) }
}

function operationError(error: unknown): TagOperationError {
  if (error instanceof InvalidStoredTagError)
    return { tagLabelError: error.reason }
  return error instanceof Error ? error.message : String(error)
}

export class TagRuntime {
  readonly #storage: EditorTagStorage
  readonly #listeners = new Set<VoidFunction>()
  readonly #editSubscriptions = new Set<TagEditSubscription>()
  readonly #operations = new Map<string, TagOperationSnapshot>()
  readonly #tagsByLabel = new Map<string, EditorTag>()
  readonly #searches = createLatestOperationSupervisor<'search'>('Tag search', {
    closedError: () => new TagRuntimeClosedError(),
    concurrency: 'parallel',
  })

  readonly #writes = createLatestOperationSupervisor<string>('Tag write', {
    closedError: () => new TagRuntimeClosedError(),
  })

  readonly #resources: ReturnType<typeof createResourceScope>

  constructor(storage: EditorTagStorage) {
    this.#storage = storage
    this.#resources = createResourceScope('Tag runtime')
    this.#resources.own({ close: () => this.#searches.close(), name: 'Tag searches' })
    this.#resources.own({ close: () => this.#writes.close(), name: 'Tag writes' })
    this.#resources.commit()
  }

  subscribe = (listener: VoidFunction) => {
    if (this.#resources.isClosed())
      return () => {}
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getSnapshot = (id: string) => this.#operations.get(id) ?? idleSnapshot

  subscribeEditing(getPosition: () => number | undefined, listener: (entry: TagEditEntry) => void) {
    if (this.#resources.isClosed())
      return () => {}
    const subscription = { getPosition, listener }
    this.#editSubscriptions.add(subscription)
    return () => {
      this.#editSubscriptions.delete(subscription)
    }
  }

  requestEditing(position: number, entry: TagEditEntry) {
    if (this.#resources.isClosed())
      return false
    let handled = false
    for (const subscription of this.#editSubscriptions) {
      if (subscription.getPosition() !== position)
        continue
      this.#notify(() => subscription.listener(entry))
      handled = true
    }
    return handled
  }

  async search(query: string) {
    if (this.#resources.isClosed())
      throw new TagRuntimeClosedError()
    const result = await this.#searches.run('search', async ({ isCurrent }) => {
      const tags = (await this.#storage.search({ query })).map(requireValidTag)
      if (!this.#resources.isClosed() && isCurrent()) {
        for (const tag of tags)
          this.#cache(tag)
      }
      return tags
    })
    return result.status === 'current' ? result.value : []
  }

  resolveOrCreate(labelInput: string) {
    this.#assertOpen()
    const label = normalizeTagLabel(labelInput)
    const error = getTagLabelError(label)
    if (error)
      throw new Error(error)

    const cached = this.#tagsByLabel.get(this.#labelKey(label))
    if (cached)
      return cached

    const tag = { id: globalThis.crypto.randomUUID(), label }
    this.#cache(tag)
    this.#save(tag, 'create')
    return tag
  }

  save(tagInput: EditorTag) {
    this.#assertOpen()
    const tag = requireValidTag(tagInput)
    const previous = this.#operations.get(tag.id)
    const action = previous?.status === 'error' && previous.action === 'create' ? 'create' : 'update'
    this.#save(tag, action)
  }

  #save(tag: EditorTag, action: TagOperationAction) {
    this.#operations.set(tag.id, { status: 'saving', action })
    this.#emit()

    const operation = this.#writes.run(tag.id, async () => {
      const storedTag = await (action === 'create' ? this.#storage.create(tag) : this.#storage.update(tag))
      return requireValidTag(storedTag)
    })
    void operation.then(
      (result) => {
        if (result.status !== 'current' || this.#resources.isClosed())
          return
        this.#removeCachedTag(tag.id)
        this.#cache(result.value)
        this.#operations.set(tag.id, { status: 'saved', action, canonicalTag: result.value })
        this.#emit()
      },
      (error) => {
        if (this.#resources.isClosed())
          return
        this.#operations.set(tag.id, { status: 'error', action, error: operationError(error) })
        this.#emit()
      },
    )
  }

  close() {
    this.#listeners.clear()
    this.#editSubscriptions.clear()
    return this.#resources.close()
  }

  #cache(tag: EditorTag) {
    this.#removeCachedTag(tag.id)
    this.#tagsByLabel.set(this.#labelKey(tag.label), tag)
  }

  #removeCachedTag(id: string) {
    for (const [key, cachedTag] of this.#tagsByLabel) {
      if (cachedTag.id === id)
        this.#tagsByLabel.delete(key)
    }
  }

  #labelKey(label: string) {
    return label.toLocaleLowerCase()
  }

  #assertOpen() {
    if (this.#resources.isClosed())
      throw new TagRuntimeClosedError()
  }

  #notify(listener: VoidFunction) {
    try {
      listener()
    }
    catch (error) {
      console.error('Tag runtime listener failed', error)
    }
  }

  #emit() {
    for (const listener of this.#listeners)
      this.#notify(listener)
  }
}
