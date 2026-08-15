import type { ReaderSidebarTab } from './reader-sidebar'
import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderAnnotationStyle,
  ReaderSelection,
} from './types'
import { isReadingRegionAnnotation } from '@memorilo/reading-model'
import { useCallback, useEffect, useReducer, useRef } from 'react'

const initialAnnotationRenderLimit = 40

export interface ReaderAnnotationWorkflowState {
  activeAnnotationId: string | null
  annotationPanelOpen: boolean
  annotationRenderLimit: number
  colorPaletteOpen: boolean
  localAnnotations: readonly ReaderAnnotation[]
  selectedColor: ReaderAnnotationColor
  sidebarTab: ReaderSidebarTab
}

export type ReaderAnnotationWorkflowEvent
  = | { annotationId: string, openPanel: boolean, type: 'activate' }
    | { annotationId: string, type: 'attached-topic' }
    | { type: 'dismiss-annotation' }
    | { annotationCount: number, type: 'load-more' }
    | { annotations: readonly ReaderAnnotation[], type: 'local-annotations' }
    | { annotationId: string, type: 'removed' }
    | { annotations: readonly ReaderAnnotation[], type: 'reconcile' }
    | { type: 'selection-changed' }
    | { open: boolean, type: 'set-color-palette' }
    | { color: ReaderAnnotationColor, type: 'set-selected-color' }
    | { tab: ReaderSidebarTab, type: 'set-sidebar-tab' }
    | { type: 'toggle-panel' }

export function createReaderAnnotationWorkflowState(
  defaultAnnotations: readonly ReaderAnnotation[],
): ReaderAnnotationWorkflowState {
  return {
    activeAnnotationId: null,
    annotationPanelOpen: false,
    annotationRenderLimit: initialAnnotationRenderLimit,
    colorPaletteOpen: false,
    localAnnotations: defaultAnnotations,
    selectedColor: 'yellow',
    sidebarTab: 'contents',
  }
}

function reconcileAnnotationIdentity(
  state: ReaderAnnotationWorkflowState,
  annotations: readonly ReaderAnnotation[],
): ReaderAnnotationWorkflowState {
  const activeAnnotationId = state.activeAnnotationId !== null
    && annotations.some(annotation => annotation.id === state.activeAnnotationId)
    ? state.activeAnnotationId
    : null
  return activeAnnotationId === state.activeAnnotationId
    ? state
    : { ...state, activeAnnotationId, colorPaletteOpen: false }
}

export function readerAnnotationWorkflowReducer(
  state: ReaderAnnotationWorkflowState,
  event: ReaderAnnotationWorkflowEvent,
): ReaderAnnotationWorkflowState {
  if (event.type === 'activate') {
    return {
      ...state,
      activeAnnotationId: event.annotationId,
      annotationPanelOpen: event.openPanel ? true : state.annotationPanelOpen,
      colorPaletteOpen: false,
      sidebarTab: event.openPanel ? 'annotations' : state.sidebarTab,
    }
  }
  if (event.type === 'attached-topic') {
    return {
      ...state,
      activeAnnotationId: event.annotationId,
      annotationPanelOpen: true,
      colorPaletteOpen: false,
      sidebarTab: 'annotations',
    }
  }
  if (event.type === 'dismiss-annotation')
    return { ...state, activeAnnotationId: null, colorPaletteOpen: false }
  if (event.type === 'load-more') {
    return {
      ...state,
      annotationRenderLimit: Math.min(
        event.annotationCount,
        state.annotationRenderLimit + initialAnnotationRenderLimit,
      ),
    }
  }
  if (event.type === 'local-annotations') {
    return reconcileAnnotationIdentity(
      { ...state, localAnnotations: event.annotations },
      event.annotations,
    )
  }
  if (event.type === 'reconcile')
    return reconcileAnnotationIdentity(state, event.annotations)
  if (event.type === 'removed') {
    return state.activeAnnotationId === event.annotationId
      ? { ...state, activeAnnotationId: null, colorPaletteOpen: false }
      : state
  }
  if (event.type === 'selection-changed') {
    return {
      ...state,
      activeAnnotationId: null,
      colorPaletteOpen: false,
    }
  }
  if (event.type === 'set-color-palette')
    return { ...state, colorPaletteOpen: event.open }
  if (event.type === 'set-selected-color')
    return { ...state, selectedColor: event.color }
  if (event.type === 'set-sidebar-tab')
    return { ...state, sidebarTab: event.tab }
  return { ...state, annotationPanelOpen: !state.annotationPanelOpen }
}

interface AnnotationIdentity {
  id: string
  timestamp: number
}

function requireAnnotation(
  annotations: readonly ReaderAnnotation[],
  annotationId: string,
): ReaderAnnotation {
  const annotation = annotations.find(candidate => candidate.id === annotationId)
  if (!annotation)
    throw new Error(`Reader annotation ${annotationId} does not exist`)
  return annotation
}

export function appendReaderHighlight(
  annotations: readonly ReaderAnnotation[],
  selection: ReaderSelection,
  color: ReaderAnnotationColor,
  identity: AnnotationIdentity,
): readonly ReaderAnnotation[] {
  const base = {
    color,
    createdAt: identity.timestamp,
    id: identity.id,
    style: 'highlight' as const,
    updatedAt: identity.timestamp,
  }
  const annotation: ReaderAnnotation = selection.type === 'text'
    ? { ...base, anchors: selection.anchors }
    : { ...base, anchors: selection.anchors }
  return [...annotations, annotation]
}

export function reviseReaderAnnotation(
  annotations: readonly ReaderAnnotation[],
  annotationId: string,
  patch: { color?: ReaderAnnotationColor, style?: ReaderAnnotationStyle },
  updatedAt: number,
): readonly ReaderAnnotation[] {
  const current = requireAnnotation(annotations, annotationId)
  const style = patch.style ?? current.style
  if (isReadingRegionAnnotation(current) && style !== 'highlight')
    throw new TypeError(`Region annotation ${annotationId} cannot use ${style} style`)
  if (patch.color === undefined && patch.style === undefined)
    throw new TypeError('Reader annotation revision must change color or style')
  return annotations.map((annotation): ReaderAnnotation => {
    if (annotation.id !== annotationId)
      return annotation
    if (isReadingRegionAnnotation(annotation))
      return { ...annotation, color: patch.color ?? annotation.color, style: 'highlight', updatedAt }
    return { ...annotation, ...patch, style, updatedAt }
  })
}

export function attachReaderAnnotationTopic(
  annotations: readonly ReaderAnnotation[],
  annotationId: string,
  topicId: string,
  updatedAt: number,
): readonly ReaderAnnotation[] {
  const normalizedTopicId = topicId.trim()
  if (!normalizedTopicId)
    throw new TypeError('Reader annotation Topic id must be a non-empty string')
  const current = requireAnnotation(annotations, annotationId)
  if (current.annotationTopicId !== undefined) {
    throw new Error(
      `Reader annotation ${annotationId} already has annotation Topic ${current.annotationTopicId}`,
    )
  }
  return annotations.map(annotation => annotation.id === annotationId
    ? { ...annotation, annotationTopicId: normalizedTopicId, updatedAt }
    : annotation)
}

export function detachReaderAnnotationTopic(
  annotations: readonly ReaderAnnotation[],
  annotationId: string,
  updatedAt: number,
): readonly ReaderAnnotation[] {
  const current = requireAnnotation(annotations, annotationId)
  if (current.annotationTopicId === undefined)
    return annotations
  return annotations.map((annotation) => {
    if (annotation.id !== annotationId)
      return annotation
    const { annotationTopicId: _annotationTopicId, ...detached } = annotation
    return { ...detached, updatedAt }
  })
}

interface UseReaderAnnotationWorkflowOptions {
  annotationEditingEnabled: boolean
  annotations?: readonly ReaderAnnotation[]
  defaultAnnotations: readonly ReaderAnnotation[]
  onAnnotationsChange?: (annotations: readonly ReaderAnnotation[]) => void
  onSelectionChange?: (selection: ReaderSelection | null) => void
}

export function useReaderAnnotationWorkflow({
  annotationEditingEnabled,
  annotations,
  defaultAnnotations,
  onAnnotationsChange,
  onSelectionChange,
}: UseReaderAnnotationWorkflowOptions) {
  const [state, dispatch] = useReducer(
    readerAnnotationWorkflowReducer,
    defaultAnnotations,
    createReaderAnnotationWorkflowState,
  )
  const visibleAnnotations = annotations ?? state.localAnnotations
  const annotationsRef = useRef(visibleAnnotations)
  const controlledRef = useRef(annotations !== undefined)
  const editingEnabledRef = useRef(annotationEditingEnabled)
  const onAnnotationsChangeRef = useRef(onAnnotationsChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  annotationsRef.current = visibleAnnotations
  controlledRef.current = annotations !== undefined
  editingEnabledRef.current = annotationEditingEnabled
  onAnnotationsChangeRef.current = onAnnotationsChange
  onSelectionChangeRef.current = onSelectionChange

  useEffect(() => {
    if (annotations !== undefined)
      dispatch({ annotations, type: 'local-annotations' })
    else
      dispatch({ annotations: visibleAnnotations, type: 'reconcile' })
  }, [annotations, visibleAnnotations])

  const assertEditingEnabled = useCallback(() => {
    if (!editingEnabledRef.current)
      throw new Error('Annotation editing is disabled for this reader session')
  }, [])

  const commitAnnotations = useCallback((next: readonly ReaderAnnotation[]) => {
    annotationsRef.current = next
    if (!controlledRef.current)
      dispatch({ annotations: next, type: 'local-annotations' })
    onAnnotationsChangeRef.current?.(next)
  }, [])

  return {
    activeAnnotationId: state.activeAnnotationId,
    annotationPanelOpen: state.annotationPanelOpen,
    annotationRenderLimit: state.annotationRenderLimit,
    annotations: visibleAnnotations,
    colorPaletteOpen: state.colorPaletteOpen,
    selectedColor: state.selectedColor,
    sidebarTab: state.sidebarTab,
    activateAnnotation: (annotationId: string) => {
      const annotation = requireAnnotation(annotationsRef.current, annotationId)
      dispatch({
        annotationId,
        openPanel: annotation.annotationTopicId !== undefined,
        type: 'activate',
      })
    },
    attachAnnotationTopic: (annotationId: string, topicId: string) => {
      assertEditingEnabled()
      commitAnnotations(attachReaderAnnotationTopic(
        annotationsRef.current,
        annotationId,
        topicId,
        Date.now(),
      ))
      dispatch({ annotationId, type: 'attached-topic' })
    },
    createHighlight: (selection: ReaderSelection | undefined): boolean => {
      assertEditingEnabled()
      if (!selection)
        return false
      commitAnnotations(appendReaderHighlight(
        annotationsRef.current,
        selection,
        state.selectedColor,
        { id: crypto.randomUUID(), timestamp: Date.now() },
      ))
      dispatch({ type: 'selection-changed' })
      return true
    },
    dismissAnnotation: () => dispatch({ type: 'dismiss-annotation' }),
    loadMoreAnnotations: () => dispatch({ annotationCount: visibleAnnotations.length, type: 'load-more' }),
    removeAnnotation: (annotationId: string) => {
      assertEditingEnabled()
      requireAnnotation(annotationsRef.current, annotationId)
      commitAnnotations(annotationsRef.current.filter(annotation => annotation.id !== annotationId))
      dispatch({ annotationId, type: 'removed' })
    },
    reviseAnnotation: (
      annotationId: string,
      patch: { color?: ReaderAnnotationColor, style?: ReaderAnnotationStyle },
    ) => {
      assertEditingEnabled()
      commitAnnotations(reviseReaderAnnotation(
        annotationsRef.current,
        annotationId,
        patch,
        Date.now(),
      ))
      dispatch({ open: false, type: 'set-color-palette' })
    },
    selectionChanged: (selection: ReaderSelection | null) => {
      dispatch({ type: 'selection-changed' })
      onSelectionChangeRef.current?.(selection)
    },
    setColorPaletteOpen: (open: boolean) => dispatch({ open, type: 'set-color-palette' }),
    setSelectedColor: (color: ReaderAnnotationColor) => dispatch({ color, type: 'set-selected-color' }),
    setSidebarTab: (tab: ReaderSidebarTab) => dispatch({ tab, type: 'set-sidebar-tab' }),
    toggleAnnotationPanel: () => dispatch({ type: 'toggle-panel' }),
  }
}
