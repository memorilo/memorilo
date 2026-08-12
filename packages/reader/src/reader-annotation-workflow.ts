import type { ReaderSidebarTab } from './reader-sidebar'
import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderNote,
  ReaderSelection,
} from './types'
import { useCallback, useEffect, useReducer, useRef } from 'react'

const initialAnnotationRenderLimit = 40

export interface ReaderAnnotationWorkflowState {
  activeAnnotationId: string | null
  annotationPanelOpen: boolean
  annotationRenderLimit: number
  colorPaletteOpen: boolean
  editingAnnotationId: string | null
  editingDraft: string
  localAnnotations: readonly ReaderAnnotation[]
  noteComposerOpen: boolean
  noteDraft: string
  selectedColor: ReaderAnnotationColor
  sidebarTab: ReaderSidebarTab
}

export type ReaderAnnotationWorkflowEvent
  = | { annotationId: string, type: 'activate' }
    | { annotation: ReaderNote, type: 'begin-edit' }
    | { type: 'cancel-edit' }
    | { type: 'created-note' }
    | { annotationCount: number, type: 'load-more' }
    | { annotations: readonly ReaderAnnotation[], type: 'local-annotations' }
    | { annotationId: string, type: 'removed' }
    | { annotations: readonly ReaderAnnotation[], type: 'reconcile' }
    | { type: 'saved-edit' }
    | { type: 'selection-changed' }
    | { open: boolean, type: 'set-color-palette' }
    | { draft: string, type: 'set-editing-draft' }
    | { open: boolean, type: 'set-note-composer' }
    | { draft: string, type: 'set-note-draft' }
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
    editingAnnotationId: null,
    editingDraft: '',
    localAnnotations: defaultAnnotations,
    noteComposerOpen: false,
    noteDraft: '',
    selectedColor: 'yellow',
    sidebarTab: 'contents',
  }
}

function reconcileAnnotationIdentity(
  state: ReaderAnnotationWorkflowState,
  annotations: readonly ReaderAnnotation[],
): ReaderAnnotationWorkflowState {
  const containsAnnotation = (annotationId: string | null): boolean => annotationId !== null
    && annotations.some(annotation => annotation.id === annotationId)
  const containsNote = (annotationId: string | null): boolean => annotationId !== null
    && annotations.some(annotation => annotation.id === annotationId && annotation.kind === 'annotation')
  const activeAnnotationId = containsAnnotation(state.activeAnnotationId) ? state.activeAnnotationId : null
  const editingAnnotationId = containsNote(state.editingAnnotationId) ? state.editingAnnotationId : null
  if (activeAnnotationId === state.activeAnnotationId && editingAnnotationId === state.editingAnnotationId)
    return state
  return {
    ...state,
    activeAnnotationId,
    editingAnnotationId,
    editingDraft: editingAnnotationId === null ? '' : state.editingDraft,
  }
}

export function readerAnnotationWorkflowReducer(
  state: ReaderAnnotationWorkflowState,
  event: ReaderAnnotationWorkflowEvent,
): ReaderAnnotationWorkflowState {
  if (event.type === 'activate') {
    return {
      ...state,
      activeAnnotationId: event.annotationId,
      annotationPanelOpen: true,
      sidebarTab: 'annotations',
    }
  }
  if (event.type === 'begin-edit') {
    return {
      ...state,
      editingAnnotationId: event.annotation.id,
      editingDraft: event.annotation.body,
    }
  }
  if (event.type === 'cancel-edit' || event.type === 'saved-edit')
    return { ...state, editingAnnotationId: null, editingDraft: '' }
  if (event.type === 'created-note') {
    return {
      ...state,
      annotationPanelOpen: true,
      colorPaletteOpen: false,
      noteComposerOpen: false,
      noteDraft: '',
      sidebarTab: 'annotations',
    }
  }
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
    return {
      ...state,
      activeAnnotationId: state.activeAnnotationId === event.annotationId ? null : state.activeAnnotationId,
      editingAnnotationId: state.editingAnnotationId === event.annotationId ? null : state.editingAnnotationId,
      editingDraft: state.editingAnnotationId === event.annotationId ? '' : state.editingDraft,
    }
  }
  if (event.type === 'selection-changed') {
    return {
      ...state,
      colorPaletteOpen: false,
      noteComposerOpen: false,
      noteDraft: '',
    }
  }
  if (event.type === 'set-color-palette')
    return { ...state, colorPaletteOpen: event.open }
  if (event.type === 'set-editing-draft')
    return { ...state, editingDraft: event.draft }
  if (event.type === 'set-note-composer')
    return { ...state, noteComposerOpen: event.open }
  if (event.type === 'set-note-draft')
    return { ...state, noteDraft: event.draft }
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

export function appendReaderHighlight(
  annotations: readonly ReaderAnnotation[],
  selection: ReaderSelection,
  color: ReaderAnnotationColor,
  identity: AnnotationIdentity,
): readonly ReaderAnnotation[] {
  return [...annotations, {
    anchor: selection.anchor,
    color,
    createdAt: identity.timestamp,
    id: identity.id,
    kind: 'highlight',
    updatedAt: identity.timestamp,
  }]
}

export function appendReaderNote(
  annotations: readonly ReaderAnnotation[],
  selection: ReaderSelection,
  color: ReaderAnnotationColor,
  body: string,
  identity: AnnotationIdentity,
): readonly ReaderAnnotation[] {
  const normalizedBody = body.trim()
  if (!normalizedBody)
    throw new TypeError('Reader annotation body must not be empty')
  return [...annotations, {
    anchor: selection.anchor,
    body: normalizedBody,
    color,
    createdAt: identity.timestamp,
    id: identity.id,
    kind: 'annotation',
    updatedAt: identity.timestamp,
  }]
}

export function reviseReaderNote(
  annotations: readonly ReaderAnnotation[],
  annotationId: string,
  body: string,
  updatedAt: number,
): readonly ReaderAnnotation[] {
  const normalizedBody = body.trim()
  if (!normalizedBody)
    throw new TypeError('Reader annotation body must not be empty')
  return annotations.map((annotation) => {
    if (annotation.id !== annotationId)
      return annotation
    if (annotation.kind !== 'annotation')
      throw new Error(`Cannot edit highlight ${annotation.id} as a text annotation`)
    return { ...annotation, body: normalizedBody, updatedAt }
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
    editingAnnotationId: state.editingAnnotationId,
    editingDraft: state.editingDraft,
    noteComposerOpen: state.noteComposerOpen,
    noteDraft: state.noteDraft,
    selectedColor: state.selectedColor,
    sidebarTab: state.sidebarTab,
    activateAnnotation: (annotationId: string) => dispatch({ annotationId, type: 'activate' }),
    beginEditAnnotation: (annotation: ReaderNote) => dispatch({ annotation, type: 'begin-edit' }),
    cancelEditAnnotation: () => dispatch({ type: 'cancel-edit' }),
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
    createNote: (selection: ReaderSelection | undefined): boolean => {
      assertEditingEnabled()
      if (!selection || !state.noteDraft.trim())
        return false
      commitAnnotations(appendReaderNote(
        annotationsRef.current,
        selection,
        state.selectedColor,
        state.noteDraft,
        { id: crypto.randomUUID(), timestamp: Date.now() },
      ))
      dispatch({ type: 'created-note' })
      return true
    },
    loadMoreAnnotations: () => dispatch({ annotationCount: visibleAnnotations.length, type: 'load-more' }),
    removeAnnotation: (annotationId: string) => {
      assertEditingEnabled()
      commitAnnotations(annotationsRef.current.filter(annotation => annotation.id !== annotationId))
      dispatch({ annotationId, type: 'removed' })
    },
    saveEditedAnnotation: () => {
      assertEditingEnabled()
      if (!state.editingAnnotationId || !state.editingDraft.trim())
        return
      commitAnnotations(reviseReaderNote(
        annotationsRef.current,
        state.editingAnnotationId,
        state.editingDraft,
        Date.now(),
      ))
      dispatch({ type: 'saved-edit' })
    },
    selectionChanged: (selection: ReaderSelection | null) => {
      dispatch({ type: 'selection-changed' })
      onSelectionChangeRef.current?.(selection)
    },
    setColorPaletteOpen: (open: boolean) => dispatch({ open, type: 'set-color-palette' }),
    setEditingDraft: (draft: string) => dispatch({ draft, type: 'set-editing-draft' }),
    setNoteComposerOpen: (open: boolean) => dispatch({ open, type: 'set-note-composer' }),
    setNoteDraft: (draft: string) => dispatch({ draft, type: 'set-note-draft' }),
    setSelectedColor: (color: ReaderAnnotationColor) => dispatch({ color, type: 'set-selected-color' }),
    setSidebarTab: (tab: ReaderSidebarTab) => dispatch({ tab, type: 'set-sidebar-tab' }),
    toggleAnnotationPanel: () => dispatch({ type: 'toggle-panel' }),
  }
}
