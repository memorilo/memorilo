import type { NodeJSON } from 'prosekit/core'
import type { OutdentBehavior } from './outline-commands'

export type OutlineFocusTarget
  = | { blockId: string }
    | { path: readonly number[] }

export interface OutlineOptions {
  defaultFocus?: OutlineFocusTarget | null
  defaultOutdentBehavior?: OutdentBehavior
  focus?: OutlineFocusTarget | null
  onFocusChange?: (focus: { blockId: string } | null) => void
}

export interface OutlineRuntimeSnapshot {
  active: boolean
  collapsedBlockIds: readonly string[]
  commandMessage: string | null
  documentRevision: number
  focusBlockId: string | null
  outdentBehavior: OutdentBehavior
  selectedBlockIds: readonly string[]
  selectionAnchorId: string | null
}

interface OutlineRuntimeOptions {
  focusBlockId?: string | null
  outdentBehavior?: OutdentBehavior
}

function listChildren(node: NodeJSON): NodeJSON[] {
  return node.content?.filter(child => child.type === 'list') ?? []
}

function readBlockId(node: NodeJSON): string {
  const blockId = node.attrs?.blockId
  if (typeof blockId !== 'string' || blockId.length === 0)
    throw new Error('Outline blocks require a stable blockId')
  return blockId
}

export function collectOutlineBlockIds(document: NodeJSON): Set<string> {
  const result = new Set<string>()
  const visit = (node: NodeJSON) => {
    if (node.type === 'list')
      result.add(readBlockId(node))
    node.content?.forEach(visit)
  }
  visit(document)
  return result
}

export function resolveOutlineFocusTarget(
  document: NodeJSON,
  target: OutlineFocusTarget,
): string {
  if ('blockId' in target) {
    if (!collectOutlineBlockIds(document).has(target.blockId))
      throw new Error(`Unknown outline block id: ${target.blockId}`)
    return target.blockId
  }

  if (target.path.length === 0)
    throw new RangeError('An outline focus path must contain at least one index')

  let current: NodeJSON = document
  for (const index of target.path) {
    if (!Number.isInteger(index) || index < 0)
      throw new RangeError(`Invalid outline focus path index: ${index}`)
    const next = listChildren(current)[index]
    if (!next)
      throw new RangeError(`Outline focus path does not resolve: ${target.path.join('.')}`)
    current = next
  }
  return readBlockId(current)
}

export class OutlineRuntime {
  private listeners = new Set<() => void>()
  private snapshot: OutlineRuntimeSnapshot

  constructor(options: OutlineRuntimeOptions = {}) {
    this.snapshot = {
      active: false,
      collapsedBlockIds: [],
      commandMessage: null,
      documentRevision: 0,
      focusBlockId: options.focusBlockId ?? null,
      outdentBehavior: options.outdentBehavior ?? 'logical',
      selectedBlockIds: [],
      selectionAnchorId: null,
    }
  }

  getSnapshot = (): OutlineRuntimeSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private update(next: OutlineRuntimeSnapshot): void {
    this.snapshot = next
    this.listeners.forEach(listener => listener())
  }

  private patch(patch: Partial<OutlineRuntimeSnapshot>): void {
    const next = { ...this.snapshot, ...patch }
    const changed = Object.keys(patch).some((key) => {
      const typedKey = key as keyof OutlineRuntimeSnapshot
      return next[typedKey] !== this.snapshot[typedKey]
    })
    if (changed)
      this.update(next)
  }

  selectBlock(blockId: string, mode: 'range' | 'toggle', visibleBlockIds: readonly string[]): void {
    if (!visibleBlockIds.includes(blockId))
      throw new Error(`Cannot select hidden outline block ${blockId}`)

    if (mode === 'toggle') {
      const selected = new Set(this.snapshot.selectedBlockIds)
      if (selected.has(blockId))
        selected.delete(blockId)
      else
        selected.add(blockId)
      this.patch({
        commandMessage: null,
        selectedBlockIds: visibleBlockIds.filter(id => selected.has(id)),
        selectionAnchorId: blockId,
      })
      return
    }

    const anchorId = this.snapshot.selectionAnchorId ?? blockId
    const anchorIndex = visibleBlockIds.indexOf(anchorId)
    const targetIndex = visibleBlockIds.indexOf(blockId)
    if (anchorIndex < 0 || targetIndex < 0)
      throw new Error('The outline selection anchor is outside the visible projection')
    const from = Math.min(anchorIndex, targetIndex)
    const to = Math.max(anchorIndex, targetIndex)
    this.patch({
      commandMessage: null,
      selectedBlockIds: visibleBlockIds.slice(from, to + 1),
    })
  }

  clearSelection(): void {
    this.patch({ selectedBlockIds: [], selectionAnchorId: null })
  }

  setActive(active: boolean): void {
    this.patch({ active })
  }

  setFocus(blockId: string | null): void {
    this.patch({
      commandMessage: null,
      focusBlockId: blockId,
      selectedBlockIds: [],
      selectionAnchorId: null,
    })
  }

  setOutdentBehavior(outdentBehavior: OutdentBehavior): void {
    this.patch({ commandMessage: null, outdentBehavior })
  }

  setCommandMessage(commandMessage: string | null): void {
    this.patch({ commandMessage })
  }

  toggleCollapsed(blockIds: readonly string[]): void {
    if (blockIds.length === 0)
      return
    const collapsed = new Set(this.snapshot.collapsedBlockIds)
    const shouldCollapse = blockIds.some(id => !collapsed.has(id))
    blockIds.forEach((id) => {
      if (shouldCollapse)
        collapsed.add(id)
      else
        collapsed.delete(id)
    })
    this.patch({ collapsedBlockIds: [...collapsed] })
  }

  reconcileDocument(document: NodeJSON): void {
    const validIds = collectOutlineBlockIds(document)
    this.update({
      ...this.snapshot,
      collapsedBlockIds: this.snapshot.collapsedBlockIds.filter(id => validIds.has(id)),
      documentRevision: this.snapshot.documentRevision + 1,
      focusBlockId: this.snapshot.focusBlockId && validIds.has(this.snapshot.focusBlockId)
        ? this.snapshot.focusBlockId
        : null,
      selectedBlockIds: this.snapshot.selectedBlockIds.filter(id => validIds.has(id)),
      selectionAnchorId: this.snapshot.selectionAnchorId && validIds.has(this.snapshot.selectionAnchorId)
        ? this.snapshot.selectionAnchorId
        : null,
    })
  }
}
