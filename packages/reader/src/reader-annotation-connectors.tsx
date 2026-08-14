import type { RefObject } from 'react'
import type { ReaderAdapterState } from './internal/reader-adapter'
import type { ReaderAnnotation } from './types'
import * as stylex from '@stylexjs/stylex'
import { useLayoutEffect, useState } from 'react'
import { findAnnotationClientRect } from './internal/annotation-geometry'
import { readerAnnotationConnectorStyles as styles } from './reader-annotation-connectors.stylex'

interface ConnectorPath {
  active: boolean
  annotationId: string
  d: string
  targetX: number
  targetY: number
}

function annotationEdge(annotation: ReaderAnnotation, adapterState: ReaderAdapterState): 'end' | 'start' {
  const anchor = annotation.anchor
  const position = adapterState.position
  if (anchor.format === 'pdf' && position.format === 'pdf')
    return anchor.pageNumber < position.pageNumber ? 'start' : 'end'
  if ((anchor.format === 'cbz' || anchor.format === 'cbr') && position.format === anchor.format)
    return anchor.pageNumber < position.pageNumber ? 'start' : 'end'
  if (anchor.format === 'txt' && position.format === 'txt') {
    const anchorOffset = anchor.type === 'text' ? anchor.start : anchor.start
    return anchorOffset < position.offset ? 'start' : 'end'
  }
  if (anchor.format === 'epub' && position.format === 'epub') {
    const anchorProgression = anchor.locator.locations?.progression
    const currentProgression = position.locator.locations?.progression
    if (typeof anchorProgression === 'number' && typeof currentProgression === 'number')
      return anchorProgression < currentProgression ? 'start' : 'end'
  }
  return 'end'
}

export function ReaderAnnotationConnectors({
  activeAnnotationId,
  adapterState,
  annotations,
  cardElements,
  engineRef,
  open,
  viewportRef,
}: {
  activeAnnotationId: string | null
  adapterState: ReaderAdapterState
  annotations: readonly ReaderAnnotation[]
  cardElements: RefObject<Map<string, HTMLElement>>
  engineRef: RefObject<HTMLDivElement | null>
  open: boolean
  viewportRef: RefObject<HTMLDivElement | null>
}) {
  const [paths, setPaths] = useState<readonly ConnectorPath[]>([])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const engine = engineRef.current
    if (!open || !viewport || !engine) {
      setPaths([])
      return
    }
    let frame: number | null = null
    const calculate = (): void => {
      frame = null
      const viewportRect = viewport.getBoundingClientRect()
      const engineRect = engine.getBoundingClientRect()
      const next: ConnectorPath[] = []
      for (const annotation of annotations) {
        if (annotation.annotationTopicId === undefined)
          continue
        const card = cardElements.current.get(annotation.id)
        if (!card)
          continue
        const cardRect = card.getBoundingClientRect()
        const annotationRect = findAnnotationClientRect(engine, annotation.id)
        const edge = annotationEdge(annotation, adapterState)
        const unclampedY = annotationRect
          ? annotationRect.top + annotationRect.height / 2
          : edge === 'start' ? engineRect.top : engineRect.bottom
        const targetY = Math.min(engineRect.bottom - 8, Math.max(engineRect.top + 8, unclampedY)) - viewportRect.top
        const targetX = annotationRect
          && annotationRect.top < engineRect.bottom
          && annotationRect.top + annotationRect.height > engineRect.top
          ? Math.min(engineRect.right - 4, annotationRect.left + annotationRect.width) - viewportRect.left
          : engineRect.right - viewportRect.left - 4
        const cardX = cardRect.left - viewportRect.left
        const cardY = Math.min(cardRect.bottom - 18, cardRect.top + 28) - viewportRect.top
        const span = Math.max(28, (cardX - targetX) * 0.42)
        next.push({
          active: annotation.id === activeAnnotationId,
          annotationId: annotation.id,
          d: `M ${targetX} ${targetY} C ${targetX + span} ${targetY}, ${cardX - span} ${cardY}, ${cardX} ${cardY}`,
          targetX,
          targetY,
        })
      }
      setPaths(next)
    }
    const schedule = (): void => {
      if (frame === null)
        frame = requestAnimationFrame(calculate)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(viewport)
    resize.observe(engine)
    for (const card of cardElements.current.values())
      resize.observe(card)
    viewport.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    calculate()
    return () => {
      if (frame !== null)
        cancelAnimationFrame(frame)
      resize.disconnect()
      viewport.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
    }
  }, [activeAnnotationId, adapterState, annotations, cardElements, engineRef, open, viewportRef])

  return paths.length === 0
    ? null
    : (
        <svg {...stylex.props(styles.overlay)} aria-hidden="true">
          {paths.map(path => (
            <g key={path.annotationId}>
              <path {...stylex.props(styles.path, path.active && styles.pathActive)} d={path.d} />
              <circle
                {...stylex.props(styles.endpoint, path.active && styles.endpointActive)}
                cx={path.targetX}
                cy={path.targetY}
                r={path.active ? 4 : 3}
              />
            </g>
          ))}
        </svg>
      )
}
