import type { DropTarget, IndicatorElements } from './outline-dnd-types'
import {
  INDENT_STEP_PX,
  INDICATOR_HEIGHT,
  INDICATOR_MARGIN,
  INDICATOR_MIN_WIDTH,
  INDICATOR_NUB_LONG,
  INDICATOR_NUB_SHORT,
  INDICATOR_NUB_WIDTH,
} from './outline-dnd-types'
import { getDotCenter } from './outline-dnd-geometry'

let indicatorElements: IndicatorElements | null = null

export function ensureIndicatorElements() {
  if (indicatorElements)
    return indicatorElements

  const root = document.createElement('div')
  root.setAttribute('data-outline-drop-indicator', 'true')
  root.style.position = 'fixed'
  root.style.display = 'none'
  root.style.pointerEvents = 'none'
  root.style.height = `${INDICATOR_HEIGHT}px`
  root.style.borderRadius = '9999px'
  root.style.zIndex = '1000'

  const nub = document.createElement('div')
  nub.setAttribute('data-outline-drop-indicator-nub', 'true')
  nub.style.position = 'absolute'
  nub.style.left = '0px'
  nub.style.width = `${INDICATOR_NUB_WIDTH}px`
  nub.style.borderRadius = '9999px'

  root.appendChild(nub)
  document.body.appendChild(root)

  indicatorElements = { root, nub }
  return indicatorElements
}

export function hideIndicator(indicator: IndicatorElements) {
  indicator.root.style.display = 'none'
}

export function setIndicatorStyle(indicator: IndicatorElements, valid: boolean) {
  // Red indicator + not-allowed cursor when drop is invalid (self/descendant).
  const color = valid ? 'var(--color-primary, currentColor)' : 'var(--color-destructive, #ef4444)'
  indicator.root.style.background = color
  indicator.nub.style.background = color
  indicator.root.style.opacity = valid ? '1' : '0.6'
}

export function positionIndicator(indicator: IndicatorElements, drop: DropTarget) {
  const dotCenter = getDotCenter(drop.element, drop.rowRect)
  const lineCenter = INDICATOR_HEIGHT / 2
  const left = (drop.type === 'child' ? dotCenter + INDENT_STEP_PX : dotCenter) - INDICATOR_NUB_WIDTH
  const right = drop.rowRect.right - INDICATOR_MARGIN
  const width = Math.max(INDICATOR_MIN_WIDTH, right - left)
  const y = drop.type === 'before' ? drop.rowRect.top : drop.rowRect.bottom

  indicator.root.style.display = 'block'
  indicator.root.style.left = `${left}px`
  indicator.root.style.top = `${y - lineCenter}px`
  indicator.root.style.width = `${width}px`

  if (drop.type === 'before') {
    indicator.nub.style.height = `${INDICATOR_NUB_SHORT}px`
    indicator.nub.style.top = `${lineCenter - INDICATOR_NUB_SHORT}px`
  }
  else if (drop.type === 'after') {
    indicator.nub.style.height = `${INDICATOR_NUB_SHORT}px`
    indicator.nub.style.top = `${lineCenter}px`
  }
  else {
    indicator.nub.style.height = `${INDICATOR_NUB_LONG}px`
    indicator.nub.style.top = `${lineCenter - INDICATOR_NUB_LONG / 2}px`
  }
}
