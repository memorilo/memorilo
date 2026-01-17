import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

export type DropType = 'before' | 'after' | 'child'

export interface DropTarget {
  pos: number
  type: DropType
  element: HTMLElement
  rowRect: DOMRect
  valid: boolean
}

export interface IndicatorElements {
  root: HTMLDivElement
  nub: HTMLDivElement
}

export interface DragState {
  view: EditorView
  fromPos: number
  drop: DropTarget | null
  indicator: IndicatorElements
  cleanup: () => void
  restoreCursor: () => void
}

export interface OutlineHit {
  node: ProseMirrorNode
  pos: number
  element: HTMLElement
  rowRect: DOMRect
}

export const DROP_LEFT_THRESHOLD_PX = 30
export const INDENT_STEP_PX = 32
export const INDICATOR_HEIGHT = 2
export const INDICATOR_NUB_WIDTH = 2
export const INDICATOR_NUB_SHORT = 8
export const INDICATOR_NUB_LONG = 14
export const INDICATOR_MIN_WIDTH = 24
export const INDICATOR_MARGIN = 10
