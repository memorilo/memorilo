import { LoroDoc } from 'loro-crdt'

const libraryMetaKey = 'whiteboardLibraryMeta'
const libraryItemsKey = 'whiteboardLibraryItems'
const libraryItemOrderKey = 'whiteboardLibraryItemOrder'
const schemaVersionKey = 'schemaVersion'

export const whiteboardLibrarySchemaVersion = 1

export interface WhiteboardLibraryElement {
  height: number
  id: string
  isDeleted: boolean
  link: string | null
  type: string
  width: number
  x: number
  y: number
  [key: string]: unknown
}

export interface WhiteboardLibraryItem {
  created: number
  elements: readonly WhiteboardLibraryElement[]
  error?: string
  id: string
  name?: string
  status: 'published' | 'unpublished'
}

export interface WhiteboardLibraryDocument {
  exportSnapshot: () => Uint8Array
  getItems: () => readonly WhiteboardLibraryItem[]
  replaceItems: (items: readonly WhiteboardLibraryItem[]) => void
}

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

function assertFiniteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`${name} must be a finite number`)
}

function validateElement(value: unknown, itemId: string, index: number): asserts value is WhiteboardLibraryElement {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`Whiteboard Library item ${itemId} element ${index} must be an object`)
  const element = value as Record<string, unknown>
  assertNonEmptyString(element.id, `Whiteboard Library item ${itemId} element ${index} id`)
  assertNonEmptyString(element.type, `Whiteboard Library item ${itemId} element ${index} type`)
  assertFiniteNumber(element.x, `Whiteboard Library item ${itemId} element ${index} x`)
  assertFiniteNumber(element.y, `Whiteboard Library item ${itemId} element ${index} y`)
  assertFiniteNumber(element.width, `Whiteboard Library item ${itemId} element ${index} width`)
  assertFiniteNumber(element.height, `Whiteboard Library item ${itemId} element ${index} height`)
  if (typeof element.isDeleted !== 'boolean')
    throw new TypeError(`Whiteboard Library item ${itemId} element ${index} isDeleted must be a boolean`)
  if (element.link !== null && typeof element.link !== 'string')
    throw new TypeError(`Whiteboard Library item ${itemId} element ${index} link must be a string or null`)
}

function validateItem(value: unknown): asserts value is WhiteboardLibraryItem {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Whiteboard Library item must be an object')
  const item = value as Record<string, unknown>
  assertNonEmptyString(item.id, 'Whiteboard Library item id')
  assertFiniteNumber(item.created, `Whiteboard Library item ${item.id} created`)
  if (item.status !== 'published' && item.status !== 'unpublished')
    throw new TypeError(`Whiteboard Library item ${item.id} status is invalid`)
  if (item.name !== undefined && typeof item.name !== 'string')
    throw new TypeError(`Whiteboard Library item ${item.id} name must be a string`)
  if (item.error !== undefined && typeof item.error !== 'string')
    throw new TypeError(`Whiteboard Library item ${item.id} error must be a string`)
  if (!Array.isArray(item.elements) || item.elements.length === 0)
    throw new TypeError(`Whiteboard Library item ${item.id} elements must be a non-empty array`)
  item.elements.forEach((element, index) => validateElement(element, item.id as string, index))
}

function validateItems(items: readonly unknown[]): asserts items is readonly WhiteboardLibraryItem[] {
  const ids = new Set<string>()
  for (const item of items) {
    validateItem(item)
    if (ids.has(item.id))
      throw new TypeError('Whiteboard Library item ids must be unique')
    ids.add(item.id)
  }
}

function openDocument(snapshot: Uint8Array | undefined): LoroDoc {
  const doc = new LoroDoc()
  if (snapshot !== undefined) {
    if (!(snapshot instanceof Uint8Array) || snapshot.byteLength === 0)
      throw new TypeError('Whiteboard Library snapshot must be a non-empty Uint8Array')
    doc.import(snapshot)
  }
  const meta = doc.getMap(libraryMetaKey)
  const storedVersion = meta.get(schemaVersionKey)
  if (snapshot !== undefined) {
    if (storedVersion !== whiteboardLibrarySchemaVersion)
      throw new TypeError(`Unsupported Whiteboard Library schema version: ${String(storedVersion)}`)
    return doc
  }
  meta.set(schemaVersionKey, whiteboardLibrarySchemaVersion)
  doc.getMap(libraryItemsKey)
  doc.getMovableList(libraryItemOrderKey)
  doc.commit({ origin: 'whiteboard-library:initialize' })
  return doc
}

export function createWhiteboardLibraryDocument(
  options: { snapshot?: Uint8Array } = {},
): WhiteboardLibraryDocument {
  const doc = openDocument(options.snapshot)
  const itemMap = doc.getMap(libraryItemsKey)
  const itemOrder = doc.getMovableList<string>(libraryItemOrderKey)

  const getItems = (): readonly WhiteboardLibraryItem[] => {
    const order: unknown = itemOrder.toJSON()
    const storedItems: unknown = itemMap.toJSON()
    if (!Array.isArray(order) || order.some(itemId => typeof itemId !== 'string'))
      throw new TypeError('Whiteboard Library item order must be a string array')
    if (storedItems === null || typeof storedItems !== 'object' || Array.isArray(storedItems))
      throw new TypeError('Whiteboard Library items must be an object')
    const record = storedItems as Record<string, unknown>
    if (new Set(order).size !== order.length)
      throw new TypeError('Whiteboard Library item order contains duplicate ids')
    const storedIds = Object.keys(record)
    if (storedIds.length !== order.length || storedIds.some(itemId => !order.includes(itemId)))
      throw new TypeError('Whiteboard Library item order does not match stored items')
    const items = order.map((itemId) => {
      const item = record[itemId]
      validateItem(item)
      if (item.id !== itemId)
        throw new TypeError(`Whiteboard Library item map key ${itemId} does not match stored id ${item.id}`)
      return item
    })
    validateItems(items)
    return structuredClone(items)
  }

  return {
    exportSnapshot: () => new Uint8Array(doc.export({ mode: 'snapshot' })),
    getItems,
    replaceItems: (items) => {
      validateItems(items)
      const cloned = structuredClone(items)
      const nextIds = new Set(cloned.map(item => item.id))
      for (const itemId of Object.keys(itemMap.toJSON())) {
        if (!nextIds.has(itemId))
          itemMap.delete(itemId)
      }
      for (const item of cloned)
        itemMap.set(item.id, item)
      if (itemOrder.length > 0)
        itemOrder.delete(0, itemOrder.length)
      for (const item of cloned)
        itemOrder.push(item.id)
      doc.commit({ origin: 'whiteboard-library:replace-items' })
    },
  }
}
