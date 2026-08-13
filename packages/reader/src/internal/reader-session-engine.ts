import type { RefObject } from 'react'
import type {
  ReaderAnnotation,
  ReaderLocation,
  ReaderOcrProvider,
  ReaderOcrStatus,
  ReaderPosition,
  ReaderPresentationMode,
  ReaderSelection,
  ReaderSource,
} from '../types'
import type {
  ReaderAdapterKeyboardEvent,
  ReaderAdapterSelection,
  ReaderAdapterState,
} from './reader-adapter'
import type {
  ReaderOperation,
  ReaderSessionEvent,
  ReaderSessionRuntime,
} from './reader-session-runtime'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { toReaderError } from './reader-adapter'
import { createReaderSessionRuntime } from './reader-session-runtime'

type ReaderStatus = 'error' | 'loading' | 'ready'

export interface ReaderSessionState {
  adapter: ReaderAdapterState
  error: Error | null
  ocrStatus: ReaderOcrStatus | null
  regionSelectionActive: boolean
  selection: ReaderAdapterSelection | null
  status: ReaderStatus
}

const initialAdapterState: ReaderAdapterState = {
  canGoBackward: false,
  canGoForward: false,
  capabilities: {},
  format: 'pdf',
  location: { format: 'pdf', label: '', progression: 0 },
  outline: [],
  position: { format: 'pdf', pageNumber: 1 },
  presentationMode: 'publisher',
  scale: 1,
  title: '',
}

export const initialReaderSessionState: ReaderSessionState = {
  adapter: initialAdapterState,
  error: null,
  ocrStatus: null,
  regionSelectionActive: false,
  selection: null,
  status: 'loading',
}

export function readerSessionReducer(state: ReaderSessionState, event: ReaderSessionEvent): ReaderSessionState {
  if (event.type === 'begin')
    return initialReaderSessionState
  if (event.type === 'error')
    return { ...state, error: event.error, status: 'error' }
  if (event.type === 'ocr-status')
    return { ...state, ocrStatus: event.status }
  if (event.type === 'ready')
    return { ...state, status: 'ready' }
  if (event.type === 'region-selection')
    return { ...state, regionSelectionActive: event.enabled }
  if (event.type === 'reset')
    return { ...state, ocrStatus: null, regionSelectionActive: false, selection: null }
  if (event.type === 'selection')
    return { ...state, selection: event.selection }
  if (event.type === 'state') {
    const ocrStatus = event.state.position.format === 'pdf'
      && state.ocrStatus?.pageNumber === event.state.position.pageNumber
      ? state.ocrStatus
      : null
    return { ...state, adapter: event.state, ocrStatus }
  }
  return state
}

interface UseReaderSessionEngineOptions {
  annotations: readonly ReaderAnnotation[]
  arrowKeyPageTurning: boolean
  initialPosition?: ReaderPosition | null
  initialPresentationMode: ReaderPresentationMode
  ocrProvider?: ReaderOcrProvider
  onAnnotationActivate: (annotationId: string) => void
  onError?: (error: Error) => void
  onLocationChange?: (location: ReaderLocation) => void
  onOcrStatusChange?: (status: ReaderOcrStatus) => void
  onPositionChange?: (position: ReaderPosition) => void
  onSelectionChange?: (selection: ReaderSelection | null) => void
  regionAnnotationLabel: () => string
  source: ReaderSource
}

export interface ReaderSessionEngine {
  clearSelection: () => void
  containerRef: RefObject<HTMLDivElement | null>
  handleKeyboardEvent: (event: ReaderAdapterKeyboardEvent) => boolean
  reportError: (error: unknown) => void
  run: (operation: ReaderOperation) => boolean
  setRegionSelectionEnabled: (enabled: boolean) => void
  state: ReaderSessionState
}

export function useReaderSessionEngine(options: UseReaderSessionEngineOptions): ReaderSessionEngine {
  const [state, dispatch] = useReducer(readerSessionReducer, initialReaderSessionState)
  const containerRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<ReaderSessionRuntime | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const notifyError = useCallback((value: unknown) => {
    const error = toReaderError(value)
    dispatch({ error, type: 'error' })
    try {
      optionsRef.current.onError?.(error)
    }
    catch {
      // Error listeners are observational and must not break reader ownership.
    }
  }, [])

  const onEvent = useCallback((event: ReaderSessionEvent) => {
    dispatch(event)
    try {
      if (event.type === 'annotation-activate') {
        optionsRef.current.onAnnotationActivate(event.annotationId)
      }
      else if (event.type === 'error') {
        optionsRef.current.onError?.(event.error)
      }
      else if (event.type === 'ocr-status') {
        optionsRef.current.onOcrStatusChange?.(event.status)
      }
      else if (event.type === 'selection') {
        optionsRef.current.onSelectionChange?.(event.selection?.selection ?? null)
      }
      else if (event.type === 'state') {
        optionsRef.current.onLocationChange?.(event.state.location)
        optionsRef.current.onPositionChange?.(event.state.position)
      }
    }
    catch (error) {
      notifyError(error)
    }
  }, [notifyError])

  useEffect(() => {
    const container = containerRef.current
    if (!container)
      return

    const runtime = createReaderSessionRuntime({
      arrowKeyPageTurning: () => optionsRef.current.arrowKeyPageTurning,
      container,
      initialAnnotations: optionsRef.current.annotations,
      initialPosition: options.initialPosition,
      initialPresentationMode: options.initialPresentationMode,
      ocrProvider: options.ocrProvider,
      onEvent,
      regionAnnotationLabel: () => optionsRef.current.regionAnnotationLabel(),
      source: options.source,
    })
    runtimeRef.current = runtime
    void runtime.start()

    return () => {
      if (runtimeRef.current === runtime)
        runtimeRef.current = null
      void runtime.close().then(
        () => undefined,
        (cleanupError) => {
          try {
            optionsRef.current.onError?.(toReaderError(cleanupError))
          }
          catch {
            // Cleanup has already failed; observer failures must not create an unhandled rejection.
          }
        },
      )
    }
  }, [onEvent, options.initialPosition, options.initialPresentationMode, options.ocrProvider, options.source])

  useEffect(() => {
    runtimeRef.current?.setAnnotations(options.annotations)
  }, [options.annotations])

  return {
    clearSelection: useCallback(() => runtimeRef.current?.clearSelection(), []),
    containerRef,
    handleKeyboardEvent: useCallback(
      (event: ReaderAdapterKeyboardEvent) => runtimeRef.current?.handleKeyboardEvent(event) ?? false,
      [],
    ),
    reportError: useCallback((error: unknown) => {
      runtimeRef.current?.reportError(error)
    }, []),
    run: useCallback((operation: ReaderOperation) => runtimeRef.current?.run(operation) ?? false, []),
    setRegionSelectionEnabled: useCallback((enabled: boolean) => {
      runtimeRef.current?.setRegionSelectionEnabled(enabled)
    }, []),
    state,
  }
}
