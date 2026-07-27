import type { EditorTag, EditorTagStorage } from '../adapters/editor-adapters'
import { getTagLabelError, normalizeTagLabel } from './tag-label'

type TagOperationAction = 'create' | 'update'
export type TagEditEntry = 'start' | 'end'

interface TagEditSubscription {
  getPosition: () => number | undefined
  listener: (entry: TagEditEntry) => void
}

export type TagOperationSnapshot
  = | { status: 'idle' }
    | { status: 'saving', action: TagOperationAction }
    | { status: 'saved', action: TagOperationAction, canonicalTag: EditorTag }
    | { status: 'error', action: TagOperationAction, error: string }

const idleSnapshot: TagOperationSnapshot = { status: 'idle' }

function requireValidTag(tag: EditorTag) {
  const error = getTagLabelError(tag.label)
  if (error)
    throw new Error(`Tag storage returned an invalid tag: ${error}`)
  if (!tag.id)
    throw new Error('Tag storage returned a tag without an id')
  return { ...tag, label: normalizeTagLabel(tag.label) }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export class TagRuntime {
  readonly #storage: EditorTagStorage
  readonly #listeners = new Set<VoidFunction>()
  readonly #editSubscriptions = new Set<TagEditSubscription>()
  readonly #operations = new Map<string, TagOperationSnapshot>()
  readonly #tagsByLabel = new Map<string, EditorTag>()

  constructor(storage: EditorTagStorage) {
    this.#storage = storage
  }

  subscribe = (listener: VoidFunction) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getSnapshot = (id: string) => this.#operations.get(id) ?? idleSnapshot

  subscribeEditing(getPosition: () => number | undefined, listener: (entry: TagEditEntry) => void) {
    const subscription = { getPosition, listener }
    this.#editSubscriptions.add(subscription)
    return () => {
      this.#editSubscriptions.delete(subscription)
    }
  }

  requestEditing(position: number, entry: TagEditEntry) {
    let handled = false
    for (const subscription of this.#editSubscriptions) {
      if (subscription.getPosition() !== position)
        continue
      subscription.listener(entry)
      handled = true
    }
    return handled
  }

  async search(query: string) {
    const tags = await this.#storage.search({ query })
    return tags.map((tag) => {
      const validTag = requireValidTag(tag)
      this.#cache(validTag)
      return validTag
    })
  }

  resolveOrCreate(labelInput: string) {
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
    const tag = requireValidTag(tagInput)
    const previous = this.#operations.get(tag.id)
    const action = previous?.status === 'error' && previous.action === 'create' ? 'create' : 'update'
    this.#save(tag, action)
  }

  #save(tag: EditorTag, action: TagOperationAction) {
    this.#operations.set(tag.id, { status: 'saving', action })
    this.#emit()

    const operation = action === 'create' ? this.#storage.create(tag) : this.#storage.update(tag)
    void operation.then(
      (storedTag) => {
        const canonicalTag = requireValidTag(storedTag)
        this.#removeCachedTag(tag.id)
        this.#cache(canonicalTag)
        this.#operations.set(tag.id, { status: 'saved', action, canonicalTag })
        this.#emit()
      },
      (error) => {
        this.#operations.set(tag.id, { status: 'error', action, error: errorMessage(error) })
        this.#emit()
      },
    )
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

  #emit() {
    for (const listener of this.#listeners)
      listener()
  }
}
