import type { CSSProperties, KeyboardEvent } from 'react'
import type { ReaderAdapter, ReaderAdapterSelection, ReaderAdapterState } from './internal/reader-adapter'
import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderNote,
  ReaderPresentationMode,
  ReaderProps,
} from './types'
import * as stylex from '@stylexjs/stylex'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Highlighter,
  Minus,
  PanelRight,
  Pencil,
  Plus,
  ScanLine,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { openReaderAdapter } from './internal/open-reader'
import { readerStyles } from './reader.stylex'

type ReaderStatus = 'error' | 'loading' | 'ready'

interface ReaderViewState {
  adapter: ReaderAdapterState
  error: Error | null
  status: ReaderStatus
}

type ReaderViewAction
  = | { type: 'begin' }
    | { error: Error, type: 'error' }
    | { type: 'ready' }
    | { adapter: ReaderAdapterState, type: 'state' }

const initialState: ReaderAdapterState = {
  canGoBackward: false,
  canGoForward: false,
  capabilities: { presentationModes: [], scale: false },
  format: 'pdf',
  location: { format: 'pdf', label: '', progression: 0 },
  presentationMode: 'publisher',
  scale: 1,
  title: '',
}

const initialViewState: ReaderViewState = {
  adapter: initialState,
  error: null,
  status: 'loading',
}

const annotationColors: readonly ReaderAnnotationColor[] = ['yellow', 'green', 'blue', 'pink', 'purple']
const noAnnotations: readonly ReaderAnnotation[] = []
const sourceKeys = new WeakMap<object, number>()
let nextSourceKey = 1

function readerSourceKey(source: ReaderProps['source']): number {
  const data = source.data
  const existing = sourceKeys.get(data)
  if (existing)
    return existing
  const key = nextSourceKey++
  sourceKeys.set(data, key)
  return key
}

function readerViewReducer(state: ReaderViewState, action: ReaderViewAction): ReaderViewState {
  if (action.type === 'begin')
    return initialViewState
  if (action.type === 'error')
    return { ...state, error: action.error, status: 'error' }
  if (action.type === 'ready')
    return { ...state, status: 'ready' }
  return { ...state, adapter: action.adapter }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function annotationLabel(annotation: ReaderAnnotation): string {
  const anchor = annotation.anchor
  if (anchor.format === 'pdf')
    return anchor.type === 'region' ? `Area on page ${anchor.pageNumber}` : `Page ${anchor.pageNumber}`
  return anchor.locator.title || anchor.locator.href
}

function annotationQuote(annotation: ReaderAnnotation): string | null {
  if (annotation.anchor.type !== 'text')
    return null
  return annotation.anchor.quote.exact
}

function colorStyle(color: ReaderAnnotationColor) {
  if (color === 'green')
    return readerStyles.colorGreen
  if (color === 'blue')
    return readerStyles.colorBlue
  if (color === 'pink')
    return readerStyles.colorPink
  if (color === 'purple')
    return readerStyles.colorPurple
  return readerStyles.colorYellow
}

function paletteColorPosition(color: ReaderAnnotationColor) {
  if (color === 'green')
    return readerStyles.paletteColorGreen
  if (color === 'blue')
    return readerStyles.paletteColorBlue
  if (color === 'pink')
    return readerStyles.paletteColorPink
  if (color === 'purple')
    return readerStyles.paletteColorPurple
  return readerStyles.paletteColorYellow
}

type SelectionPopoverPlacement = 'above' | 'below'

interface SelectionPopoverLayout {
  placement: SelectionPopoverPlacement
  style: CSSProperties
}

function selectionPopoverLayout(
  selection: ReaderAdapterSelection,
  composerOpen: boolean,
  colorPaletteOpen: boolean,
): SelectionPopoverLayout {
  const center = selection.clientRect.left + selection.clientRect.width / 2
  const compactRegionToolbar = selection.selection.type === 'region' && !colorPaletteOpen
  const estimatedWidth = composerOpen ? 320 : compactRegionToolbar ? 220 : 270
  const estimatedHeight = composerOpen ? 270 : 52
  const edgeInset = 12
  const halfWidth = Math.min(estimatedWidth / 2, (window.innerWidth - edgeInset * 2) / 2)
  const left = Math.min(window.innerWidth - edgeInset - halfWidth, Math.max(edgeInset + halfWidth, center))
  const placement: SelectionPopoverPlacement = selection.clientRect.top >= estimatedHeight + 20
    ? 'above'
    : 'below'

  return {
    placement,
    style: {
      left,
      top: placement === 'above'
        ? selection.clientRect.top - 10
        : selection.clientRect.top + selection.clientRect.height + 10,
    },
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
}

function ReaderSession({
  annotations,
  ariaLabel = 'Document reader',
  defaultAnnotations = noAnnotations,
  initialPresentationMode = 'publisher',
  ocrProvider,
  onAnnotationsChange,
  onError,
  onLocationChange,
  onOcrStatusChange,
  onSelectionChange,
  source,
}: ReaderProps) {
  const engineRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<ReaderAdapter | null>(null)
  const annotationsControlled = annotations !== undefined
  const [localAnnotations, setLocalAnnotations] = useState<readonly ReaderAnnotation[]>(() => defaultAnnotations)
  const visibleAnnotations = annotations ?? localAnnotations
  const annotationsRef = useRef(visibleAnnotations)
  annotationsRef.current = visibleAnnotations
  const onAnnotationsChangeRef = useRef(onAnnotationsChange)
  onAnnotationsChangeRef.current = onAnnotationsChange
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onLocationChangeRef = useRef(onLocationChange)
  onLocationChangeRef.current = onLocationChange
  const onOcrStatusChangeRef = useRef(onOcrStatusChange)
  onOcrStatusChangeRef.current = onOcrStatusChange
  const onSelectionChangeRef = useRef(onSelectionChange)
  onSelectionChangeRef.current = onSelectionChange

  const [view, dispatch] = useReducer(readerViewReducer, initialViewState)
  const [selection, setSelection] = useState<ReaderAdapterSelection | null>(null)
  const [selectedColor, setSelectedColor] = useState<ReaderAnnotationColor>('yellow')
  const [colorPaletteOpen, setColorPaletteOpen] = useState(false)
  const [noteComposerOpen, setNoteComposerOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [annotationPanelOpen, setAnnotationPanelOpen] = useState(false)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const [regionSelectionActive, setRegionSelectionActive] = useState(false)
  const { adapter: adapterState, error, status } = view

  const reportError = useCallback((value: unknown) => {
    const nextError = toError(value)
    dispatch({ error: nextError, type: 'error' })
    onErrorRef.current?.(nextError)
  }, [])

  useEffect(() => {
    const container = engineRef.current
    if (!container)
      return

    let active = true
    let opened: ReaderAdapter | null = null
    dispatch({ type: 'begin' })
    const startingAnnotations = annotationsRef.current

    void (async () => {
      opened = await openReaderAdapter(source, initialPresentationMode, ocrProvider, {
        onAnnotationActivate: ({ annotationId }) => {
          if (!active)
            return
          setActiveAnnotationId(annotationId)
          setAnnotationPanelOpen(true)
        },
        onError: reportError,
        onOcrStatusChange: ocrStatus => onOcrStatusChangeRef.current?.(ocrStatus),
        onSelectionChange: (nextSelection) => {
          if (!active)
            return
          setSelection(nextSelection)
          setColorPaletteOpen(false)
          setNoteComposerOpen(false)
          setNoteDraft('')
          if (nextSelection)
            setRegionSelectionActive(false)
          onSelectionChangeRef.current?.(nextSelection?.selection ?? null)
        },
        onStateChange: (state) => {
          if (!active)
            return
          dispatch({ adapter: state, type: 'state' })
          onLocationChangeRef.current?.(state.location)
        },
      })
      opened.setAnnotations(startingAnnotations)
      if (!active) {
        await opened.destroy()
        return
      }
      adapterRef.current = opened
      await opened.mount(container)
      if (active)
        dispatch({ type: 'ready' })
    })().catch((loadError) => {
      if (active)
        reportError(loadError)
    })

    return () => {
      active = false
      adapterRef.current = null
      container.replaceChildren()
      if (opened)
        void opened.destroy()
    }
  }, [annotationsControlled, initialPresentationMode, ocrProvider, reportError, source])

  useEffect(() => {
    adapterRef.current?.setAnnotations(visibleAnnotations)
  }, [visibleAnnotations])

  const run = useCallback((operation: (adapter: ReaderAdapter) => Promise<void>) => {
    const adapter = adapterRef.current
    if (!adapter)
      return
    void operation(adapter).catch(reportError)
  }, [reportError])

  const commitAnnotations = useCallback((next: readonly ReaderAnnotation[]) => {
    annotationsRef.current = next
    if (!annotationsControlled)
      setLocalAnnotations(next)
    onAnnotationsChangeRef.current?.(next)
  }, [annotationsControlled])

  const dismissSelection = useCallback(() => {
    const adapter = adapterRef.current
    if (adapter) {
      adapter.clearSelection()
    }
    else {
      setSelection(null)
      setNoteComposerOpen(false)
      setNoteDraft('')
      onSelectionChangeRef.current?.(null)
    }
  }, [])

  const createHighlight = useCallback(() => {
    if (!selection)
      return
    const now = Date.now()
    commitAnnotations([
      ...annotationsRef.current,
      {
        anchor: selection.selection.anchor,
        color: selectedColor,
        createdAt: now,
        id: crypto.randomUUID(),
        kind: 'highlight',
        updatedAt: now,
      },
    ])
    dismissSelection()
  }, [commitAnnotations, dismissSelection, selectedColor, selection])

  const copySelection = useCallback(() => {
    if (!selection || selection.selection.type !== 'text')
      return
    void navigator.clipboard.writeText(selection.selection.text)
      .then(dismissSelection)
      .catch(reportError)
  }, [dismissSelection, reportError, selection])

  const createNote = useCallback(() => {
    if (!selection)
      return
    const body = noteDraft.trim()
    if (!body)
      return
    const now = Date.now()
    commitAnnotations([
      ...annotationsRef.current,
      {
        anchor: selection.selection.anchor,
        body,
        color: selectedColor,
        createdAt: now,
        id: crypto.randomUUID(),
        kind: 'annotation',
        updatedAt: now,
      },
    ])
    setAnnotationPanelOpen(true)
    dismissSelection()
  }, [commitAnnotations, dismissSelection, noteDraft, selectedColor, selection])

  const removeAnnotation = useCallback((annotationId: string) => {
    commitAnnotations(annotationsRef.current.filter(annotation => annotation.id !== annotationId))
    if (activeAnnotationId === annotationId)
      setActiveAnnotationId(null)
    if (editingAnnotationId === annotationId)
      setEditingAnnotationId(null)
  }, [activeAnnotationId, commitAnnotations, editingAnnotationId])

  const beginEditAnnotation = useCallback((annotation: ReaderNote) => {
    setEditingAnnotationId(annotation.id)
    setEditingDraft(annotation.body)
  }, [])

  const saveEditedAnnotation = useCallback(() => {
    const body = editingDraft.trim()
    if (!editingAnnotationId || !body)
      return
    commitAnnotations(annotationsRef.current.map((annotation) => {
      if (annotation.id !== editingAnnotationId)
        return annotation
      if (annotation.kind !== 'annotation')
        throw new Error(`Cannot edit highlight ${annotation.id} as a text annotation`)
      return { ...annotation, body, updatedAt: Date.now() }
    }))
    setEditingAnnotationId(null)
    setEditingDraft('')
  }, [commitAnnotations, editingAnnotationId, editingDraft])

  const setMode = useCallback((mode: ReaderPresentationMode) => {
    run(adapter => adapter.setPresentationMode(mode))
  }, [run])

  const toggleRegionSelection = useCallback(() => {
    const next = !regionSelectionActive
    adapterRef.current?.setRegionSelectionEnabled(next)
    setRegionSelectionActive(next)
    if (next)
      dismissSelection()
  }, [dismissSelection, regionSelectionActive])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (regionSelectionActive) {
        event.preventDefault()
        adapterRef.current?.setRegionSelectionEnabled(false)
        setRegionSelectionActive(false)
      }
      else if (selection) {
        event.preventDefault()
        dismissSelection()
      }
      return
    }
    if (isTypingTarget(event.target) || event.target instanceof HTMLButtonElement)
      return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      run(adapter => adapter.goBackward())
    }
    else if (event.key === 'ArrowRight') {
      event.preventDefault()
      run(adapter => adapter.goForward())
    }
  }, [dismissSelection, regionSelectionActive, run, selection])

  const readerModeAvailable = adapterState.capabilities.presentationModes.includes('reader')
  const progress = Math.round(Math.min(1, Math.max(0, adapterState.location.progression)) * 100)
  const popoverLayout = selection
    ? selectionPopoverLayout(selection, noteComposerOpen, colorPaletteOpen)
    : undefined
  const popoverBelow = popoverLayout?.placement === 'below'
  const compactRegionToolbar = selection?.selection.type === 'region' && !colorPaletteOpen

  return (
    <div
      {...stylex.props(readerStyles.root)}
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <header {...stylex.props(readerStyles.toolbar)}>
        <div {...stylex.props(readerStyles.titleGroup)}>
          <h2 {...stylex.props(readerStyles.title)}>{adapterState.title || source.name || 'Document'}</h2>
          <span {...stylex.props(readerStyles.format)}>{adapterState.format}</span>
          {adapterState.textLayer === 'ocr'
            ? <span {...stylex.props(readerStyles.statusChip)}>OCR text</span>
            : null}
          {adapterState.textLayer === 'recognizing'
            ? <span {...stylex.props(readerStyles.statusChip)}>Recognizing…</span>
            : null}
          {adapterState.format === 'pdf' && adapterState.textLayer === 'none' && status === 'ready'
            ? <span {...stylex.props(readerStyles.statusChip)}>Image page</span>
            : null}
        </div>

        <div {...stylex.props(readerStyles.navigation)}>
          <button
            {...stylex.props(readerStyles.button)}
            aria-label="Previous"
            disabled={status !== 'ready' || !adapterState.canGoBackward}
            title="Previous"
            type="button"
            onClick={() => run(adapter => adapter.goBackward())}
          >
            <ChevronLeft aria-hidden="true" size={17} strokeWidth={1.9} />
          </button>
          <span {...stylex.props(readerStyles.location)} aria-live="polite">
            {adapterState.location.label || 'Opening…'}
          </span>
          <button
            {...stylex.props(readerStyles.button)}
            aria-label="Next"
            disabled={status !== 'ready' || !adapterState.canGoForward}
            title="Next"
            type="button"
            onClick={() => run(adapter => adapter.goForward())}
          >
            <ChevronRight aria-hidden="true" size={17} strokeWidth={1.9} />
          </button>
        </div>

        <div {...stylex.props(readerStyles.actions)}>
          {adapterState.format === 'epub'
            ? (
                <div {...stylex.props(readerStyles.modeGroup)} aria-label="EPUB layout" role="group">
                  <button
                    {...stylex.props(
                      readerStyles.modeButton,
                      adapterState.presentationMode === 'publisher' && readerStyles.modeButtonActive,
                    )}
                    aria-pressed={adapterState.presentationMode === 'publisher'}
                    type="button"
                    onClick={() => setMode('publisher')}
                  >
                    Publisher
                  </button>
                  <button
                    {...stylex.props(
                      readerStyles.modeButton,
                      adapterState.presentationMode === 'reader' && readerStyles.modeButtonActive,
                      !readerModeAvailable && readerStyles.modeButtonDisabled,
                    )}
                    aria-pressed={adapterState.presentationMode === 'reader'}
                    disabled={!readerModeAvailable}
                    title={adapterState.presentationModeReason}
                    type="button"
                    onClick={() => setMode('reader')}
                  >
                    Reader
                  </button>
                </div>
              )
            : null}
          {adapterState.capabilities.regionSelection
            ? (
                <button
                  {...stylex.props(readerStyles.button, regionSelectionActive && readerStyles.buttonActive)}
                  aria-label="Select an area to annotate"
                  aria-pressed={regionSelectionActive}
                  disabled={status !== 'ready'}
                  title="Select an area to annotate"
                  type="button"
                  onClick={toggleRegionSelection}
                >
                  <ScanLine aria-hidden="true" size={16} strokeWidth={1.8} />
                </button>
              )
            : null}
          {adapterState.capabilities.ocr
            ? (
                <button
                  {...stylex.props(readerStyles.button)}
                  aria-label="Recognize text on this page"
                  disabled={status !== 'ready' || adapterState.textLayer === 'recognizing'}
                  title="Recognize text on this page"
                  type="button"
                  onClick={() => run(adapter => adapter.recognizeCurrentPage())}
                >
                  <Sparkles aria-hidden="true" size={15} strokeWidth={1.8} />
                </button>
              )
            : null}
          <button
            {...stylex.props(readerStyles.button)}
            aria-label={adapterState.format === 'pdf' ? 'Zoom out' : 'Decrease text size'}
            disabled={status !== 'ready' || !adapterState.capabilities.scale || adapterState.scale <= 0.75}
            title={adapterState.format === 'pdf' ? 'Zoom out' : 'Decrease text size'}
            type="button"
            onClick={() => run(adapter => adapter.setScale(adapterState.scale - 0.1))}
          >
            <Minus aria-hidden="true" size={15} strokeWidth={2} />
          </button>
          <button
            {...stylex.props(readerStyles.button)}
            aria-label={adapterState.format === 'pdf' ? 'Zoom in' : 'Increase text size'}
            disabled={status !== 'ready' || !adapterState.capabilities.scale || adapterState.scale >= 2}
            title={adapterState.format === 'pdf' ? 'Zoom in' : 'Increase text size'}
            type="button"
            onClick={() => run(adapter => adapter.setScale(adapterState.scale + 0.1))}
          >
            <Plus aria-hidden="true" size={15} strokeWidth={2} />
          </button>
          <button
            {...stylex.props(readerStyles.button, annotationPanelOpen && readerStyles.buttonActive)}
            aria-label="Annotations"
            aria-pressed={annotationPanelOpen}
            title="Annotations"
            type="button"
            onClick={() => setAnnotationPanelOpen(open => !open)}
          >
            <PanelRight aria-hidden="true" size={16} strokeWidth={1.8} />
            {visibleAnnotations.length > 0
              ? <span {...stylex.props(readerStyles.annotationBadge)}>{visibleAnnotations.length}</span>
              : null}
          </button>
        </div>
      </header>

      <div {...stylex.props(readerStyles.viewport)}>
        <div {...stylex.props(readerStyles.enginePane)}>
          <div ref={engineRef} {...stylex.props(readerStyles.engine)} />
          {status !== 'ready'
            ? (
                <div
                  {...stylex.props(readerStyles.overlay, status === 'error' && readerStyles.error)}
                  aria-live="polite"
                  role={status === 'error' ? 'alert' : 'status'}
                >
                  {status === 'error' ? error?.message : 'Opening document…'}
                </div>
              )
            : null}
        </div>

        {annotationPanelOpen
          ? (
              <aside {...stylex.props(readerStyles.annotationPanel)} aria-label="Annotations">
                <div {...stylex.props(readerStyles.panelHeader)}>
                  <div>
                    <h3 {...stylex.props(readerStyles.panelTitle)}>Annotations</h3>
                    <p {...stylex.props(readerStyles.panelSubtitle)}>
                      {visibleAnnotations.length}
                      {' '}
                      total
                    </p>
                  </div>
                  <button
                    {...stylex.props(readerStyles.button)}
                    aria-label="Close annotations"
                    type="button"
                    onClick={() => setAnnotationPanelOpen(false)}
                  >
                    <X aria-hidden="true" size={15} />
                  </button>
                </div>
                <div {...stylex.props(readerStyles.annotationList)}>
                  {visibleAnnotations.length === 0
                    ? (
                        <div {...stylex.props(readerStyles.emptyAnnotations)}>
                          No annotations
                        </div>
                      )
                    : visibleAnnotations.map((annotation) => {
                        const quote = annotationQuote(annotation)
                        const editing = editingAnnotationId === annotation.id
                        return (
                          <article
                            key={annotation.id}
                            {...stylex.props(
                              readerStyles.annotationItem,
                              activeAnnotationId === annotation.id && readerStyles.annotationItemActive,
                            )}
                          >
                            <button
                              {...stylex.props(readerStyles.annotationTarget)}
                              type="button"
                              onClick={() => {
                                setActiveAnnotationId(annotation.id)
                                run(adapter => adapter.goToAnnotation(annotation.id))
                              }}
                            >
                              <span {...stylex.props(readerStyles.annotationDot, colorStyle(annotation.color))} />
                              <span {...stylex.props(readerStyles.annotationMeta)}>
                                {annotation.kind === 'annotation' ? 'Annotation' : 'Highlight'}
                                {' · '}
                                {annotationLabel(annotation)}
                              </span>
                            </button>
                            {quote
                              ? <blockquote {...stylex.props(readerStyles.annotationQuote)}>{quote}</blockquote>
                              : null}
                            {annotation.kind === 'annotation'
                              ? editing
                                ? (
                                    <div {...stylex.props(readerStyles.panelEditor)}>
                                      <textarea
                                        {...stylex.props(readerStyles.panelTextarea)}
                                        aria-label="Edit annotation"
                                        rows={4}
                                        value={editingDraft}
                                        onChange={event => setEditingDraft(event.target.value)}
                                      />
                                      <div {...stylex.props(readerStyles.panelEditorActions)}>
                                        <button
                                          {...stylex.props(readerStyles.textButton)}
                                          type="button"
                                          onClick={() => setEditingAnnotationId(null)}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          {...stylex.props(readerStyles.primaryTextButton)}
                                          disabled={!editingDraft.trim()}
                                          type="button"
                                          onClick={saveEditedAnnotation}
                                        >
                                          <Check aria-hidden="true" size={13} />
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  )
                                : <p {...stylex.props(readerStyles.annotationBody)}>{annotation.body}</p>
                              : null}
                            {!editing
                              ? (
                                  <div {...stylex.props(readerStyles.annotationActions)}>
                                    {annotation.kind === 'annotation'
                                      ? (
                                          <button
                                            {...stylex.props(readerStyles.itemButton)}
                                            aria-label="Edit annotation"
                                            type="button"
                                            onClick={() => beginEditAnnotation(annotation)}
                                          >
                                            <Pencil aria-hidden="true" size={13} />
                                          </button>
                                        )
                                      : null}
                                    <button
                                      {...stylex.props(readerStyles.itemButton, readerStyles.deleteButton)}
                                      aria-label="Delete annotation"
                                      type="button"
                                      onClick={() => removeAnnotation(annotation.id)}
                                    >
                                      <Trash2 aria-hidden="true" size={13} />
                                    </button>
                                  </div>
                                )
                              : null}
                          </article>
                        )
                      })}
                </div>
              </aside>
            )
          : null}
      </div>

      {selection && !noteComposerOpen
        ? (
            <div
              {...stylex.props(
                readerStyles.glassPopover,
                readerStyles.selectionToolbar,
                compactRegionToolbar && readerStyles.selectionToolbarRegion,
                popoverBelow ? readerStyles.popoverBelow : readerStyles.popoverAbove,
              )}
              aria-label="Selection actions"
              role="toolbar"
              style={popoverLayout?.style}
            >
              {colorPaletteOpen
                ? annotationColors.map(color => (
                    <button
                      key={color}
                      {...stylex.props(
                        readerStyles.paletteSwatch,
                        paletteColorPosition(color),
                        colorStyle(color),
                        selectedColor === color && readerStyles.colorButtonSelected,
                      )}
                      aria-label={`${color} annotation`}
                      aria-pressed={selectedColor === color}
                      title={`Use ${color}`}
                      type="button"
                      onClick={() => {
                        setSelectedColor(color)
                        setColorPaletteOpen(false)
                      }}
                    />
                  ))
                : (
                    <>
                      {selection.selection.type === 'text'
                        ? (
                            <button
                              {...stylex.props(
                                readerStyles.paletteTool,
                                readerStyles.paletteCopy,
                              )}
                              aria-label="Copy selection"
                              title="Copy"
                              type="button"
                              onClick={copySelection}
                            >
                              <Copy aria-hidden="true" size={18} strokeWidth={1.85} />
                            </button>
                          )
                        : null}
                      <button
                        {...stylex.props(
                          readerStyles.paletteTool,
                          readerStyles.paletteColorTool,
                          readerStyles.paletteColor,
                          selection.selection.type === 'region' && readerStyles.paletteColorRegion,
                        )}
                        aria-label="Choose annotation color"
                        aria-expanded={colorPaletteOpen}
                        title="Color"
                        type="button"
                        onClick={() => setColorPaletteOpen(true)}
                      >
                        <span {...stylex.props(readerStyles.paletteCurrentColor, colorStyle(selectedColor))} />
                      </button>
                      <button
                        {...stylex.props(
                          readerStyles.paletteTool,
                          readerStyles.paletteHighlight,
                          selection.selection.type === 'region' && readerStyles.paletteHighlightRegion,
                        )}
                        aria-label={selection.selection.type === 'text' ? 'Highlight selection' : 'Highlight area'}
                        title="Highlight"
                        type="button"
                        onClick={createHighlight}
                      >
                        <Highlighter aria-hidden="true" size={19} strokeWidth={1.85} />
                      </button>
                      <button
                        {...stylex.props(
                          readerStyles.paletteTool,
                          readerStyles.paletteAnnotate,
                          selection.selection.type === 'region' && readerStyles.paletteAnnotateRegion,
                        )}
                        aria-label={selection.selection.type === 'text' ? 'Annotate selection' : 'Annotate area'}
                        title="Annotate"
                        type="button"
                        onClick={() => {
                          setColorPaletteOpen(false)
                          setNoteComposerOpen(true)
                        }}
                      >
                        <StickyNote aria-hidden="true" size={19} strokeWidth={1.85} />
                      </button>
                    </>
                  )}
              <button
                {...stylex.props(
                  readerStyles.paletteTool,
                  readerStyles.paletteClose,
                )}
                aria-label="Dismiss selection actions"
                title="Close"
                type="button"
                onClick={dismissSelection}
              >
                <X aria-hidden="true" size={18} strokeWidth={1.85} />
              </button>
            </div>
          )
        : null}

      {selection && noteComposerOpen
        ? (
            <div
              {...stylex.props(
                readerStyles.glassPopover,
                readerStyles.noteComposer,
                popoverBelow ? readerStyles.popoverBelow : readerStyles.popoverAbove,
              )}
              aria-label="Add annotation"
              role="dialog"
              style={popoverLayout?.style}
            >
              <div {...stylex.props(readerStyles.composerHeader)}>
                <span {...stylex.props(readerStyles.composerTitle)}>
                  {selection.selection.type === 'text' ? 'Annotate selection' : 'Annotate area'}
                </span>
                <button
                  {...stylex.props(readerStyles.selectionClose)}
                  aria-label="Cancel annotation"
                  type="button"
                  onClick={() => setNoteComposerOpen(false)}
                >
                  <X aria-hidden="true" size={14} />
                </button>
              </div>
              {selection.selection.type === 'text'
                ? <div {...stylex.props(readerStyles.composerQuote)}>{selection.selection.text}</div>
                : null}
              <textarea
                autoFocus
                {...stylex.props(readerStyles.composerTextarea)}
                aria-label="Annotation text"
                placeholder="Write a note…"
                rows={4}
                value={noteDraft}
                onChange={event => setNoteDraft(event.target.value)}
              />
              <div {...stylex.props(readerStyles.composerFooter)}>
                <div {...stylex.props(readerStyles.colorGroup)} aria-label="Annotation color" role="group">
                  {annotationColors.map(color => (
                    <button
                      key={color}
                      {...stylex.props(
                        readerStyles.colorButton,
                        colorStyle(color),
                        selectedColor === color && readerStyles.colorButtonSelected,
                      )}
                      aria-label={`${color} annotation`}
                      aria-pressed={selectedColor === color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                    />
                  ))}
                </div>
                <button
                  {...stylex.props(readerStyles.primaryTextButton)}
                  disabled={!noteDraft.trim()}
                  type="button"
                  onClick={createNote}
                >
                  Add annotation
                </button>
              </div>
            </div>
          )
        : null}

      <div {...stylex.props(readerStyles.footer)} aria-hidden="true">
        <div {...stylex.props(readerStyles.progress)} style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

export function Reader(props: ReaderProps) {
  return <ReaderSession key={readerSourceKey(props.source)} {...props} />
}
