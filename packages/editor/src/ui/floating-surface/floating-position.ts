import type { Placement, VirtualElement } from '@floating-ui/react'

export function floatingPointReference(x: number, y: number): VirtualElement {
  return {
    getBoundingClientRect: () => new DOMRect(x, y, 0, 0),
  }
}

export function floatingTransformOrigin(placement: Placement): string {
  const [side, alignment] = placement.split('-')
  const horizontal = side === 'left'
    ? 'right'
    : side === 'right'
      ? 'left'
      : alignment === 'start'
        ? 'left'
        : alignment === 'end' ? 'right' : 'center'
  const vertical = side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : 'center'
  return `${horizontal} ${vertical}`
}
