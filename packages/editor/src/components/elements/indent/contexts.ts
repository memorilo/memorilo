import type { Path, Element as SlateElement } from 'slate'
import { createContext } from 'react'

export const IndentEnableContext = createContext(false)

export interface IndentChildCollapseContextValueType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}

export const IndentChildCollapseContext = createContext<IndentChildCollapseContextValueType>({
  collapsed: false,
  setCollapsed: () => {},
})

export type IndentDropPosition = 'before' | 'after' | 'inside'

export interface IndentDragOverState {
  targetPath: Path
  targetElement: SlateElement
  position: IndentDropPosition
}

export interface IndentDragContextValueType {
  isDragging: boolean
  dragging: { path: Path, element: SlateElement, pointerId: number } | null
  over: IndentDragOverState | null
  endDrag: () => void
  startDrag: (path: Path, element: SlateElement, pointerId: number) => void
}

export const IndentDragContext = createContext<IndentDragContextValueType>({
  isDragging: false,
  dragging: null,
  over: null,
  endDrag: () => {},
  startDrag: () => {},
})
