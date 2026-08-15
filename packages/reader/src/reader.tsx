import type { RefObject } from 'react'
import type {
  ReaderAnnotation,
  ReaderClientRect,
  ReaderProps,
} from './types'
import * as stylex from '@stylexjs/stylex'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { annotationCopyText } from './internal/annotation-copy'
import { findAnnotationClientRect } from './internal/annotation-geometry'
import { readerAnnotationLabel } from './internal/annotation-label'
import { useReaderSessionEngine } from './internal/reader-session-engine'
import { ReaderAnnotationConnectors } from './reader-annotation-connectors'
import {
  requestReaderAnnotationDeletion,
  startReaderAnnotationDeletionPreparation,
} from './reader-annotation-deletion'
import { ReaderAnnotationPopover } from './reader-annotation-popover'
import { useReaderAnnotationWorkflow } from './reader-annotation-workflow'
import { ReaderImageOcclusionOverlays } from './reader-image-occlusion-overlays'
import { ReaderSelectionPopover } from './reader-selection-popover'
import { useReaderSessionCommands } from './reader-session-commands'
import { readerShellStyles as readerStyles } from './reader-shell.stylex'
import { ReaderSidebar } from './reader-sidebar'
import { ReaderToolbar } from './reader-toolbar'

const noAnnotations: readonly ReaderAnnotation[] = []
const noImageOcclusionOverlays: NonNullable<ReaderProps['imageOcclusionOverlays']> = []
const sourceKeys = new WeakMap<object, number>()
let nextSourceKey = 1

function readerSourceKey(source: ReaderProps['source']): number {
  const identity = 'data' in source && source.data !== undefined ? source.data : source.read
  const existing = sourceKeys.get(identity)
  if (existing !== undefined)
    return existing
  const key = nextSourceKey++
  sourceKeys.set(identity, key)
  return key
}

function visibleClientRect(rect: ReaderClientRect | null): ReaderClientRect | null {
  if (!rect)
    return null
  if (rect.left + rect.width <= 0
    || rect.top + rect.height <= 0
    || rect.left >= window.innerWidth
    || rect.top >= window.innerHeight) {
    return null
  }
  return rect
}

function useAnnotationClientRect(
  engineRef: RefObject<HTMLDivElement | null>,
  annotationId: string | null,
  invalidationKey: unknown,
): ReaderClientRect | null {
  const [rect, setRect] = useState<ReaderClientRect | null>(null)

  useLayoutEffect(() => {
    const engine = engineRef.current
    if (!engine || annotationId === null) {
      setRect(null)
      return
    }
    let frame: number | null = null
    const calculate = (): void => {
      frame = null
      setRect(visibleClientRect(findAnnotationClientRect(engine, annotationId)))
    }
    const schedule = (): void => {
      if (frame === null)
        frame = requestAnimationFrame(calculate)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(engine)
    document.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule, { passive: true })
    calculate()
    return () => {
      if (frame !== null)
        cancelAnimationFrame(frame)
      resize.disconnect()
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [annotationId, engineRef, invalidationKey])

  return rect
}

function ReaderDeleteAnnotationDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('common')
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog)
      throw new Error('Reader delete annotation dialog is not mounted')
    dialog.showModal()
    return () => {
      if (dialog.open)
        dialog.close()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      {...stylex.props(readerStyles.dialog)}
      aria-labelledby="reader-delete-highlight-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending)
          onCancel()
      }}
    >
      <h2 id="reader-delete-highlight-title" {...stylex.props(readerStyles.dialogTitle)}>
        {t('reader.deleteLinkedHighlightTitle')}
      </h2>
      <p {...stylex.props(readerStyles.dialogDescription)}>
        {t('reader.deleteLinkedHighlightDescription')}
      </p>
      <div {...stylex.props(readerStyles.dialogActions)}>
        <button
          {...stylex.props(readerStyles.dialogButton)}
          autoFocus
          disabled={pending}
          type="button"
          onClick={onCancel}
        >
          {t('reader.cancel')}
        </button>
        <button
          {...stylex.props(readerStyles.dialogButton, readerStyles.dialogPrimaryButton)}
          disabled={pending}
          type="button"
          onClick={onConfirm}
        >
          {t('reader.deleteHighlight')}
        </button>
      </div>
    </dialog>
  )
}

interface ReaderSessionProps extends ReaderProps {
  chrome: 'embedded' | 'window'
}

function ReaderSession({
  annotationCopyBookTitle,
  annotationCopyFormat = 'text',
  annotationEditingEnabled = true,
  annotations,
  ariaLabel,
  arrowKeyPageTurning = true,
  auxiliarySidebar,
  chrome,
  defaultAnnotations = noAnnotations,
  imageOcclusionOverlays = noImageOcclusionOverlays,
  initialAnnotationId,
  initialPosition,
  initialPresentationMode = 'publisher',
  ocrProvider,
  onAnnotationsChange,
  onCreateAnnotationTopic,
  onDetachAnnotationTopic,
  onError,
  onGetAnnotationDependents,
  onLocationChange,
  onOcrStatusChange,
  onPrepareAnnotationDeletion,
  onOpenReaderRegionImageOcclusion,
  onPositionChange,
  onSelectionChange,
  pageMode = 'continuous',
  sidebarActions,
  renderAnnotationEditor,
  source,
  title,
  toolbarActions,
}: ReaderSessionProps) {
  const { t } = useTranslation('common')
  const annotationWorkflow = useReaderAnnotationWorkflow({
    annotationEditingEnabled,
    annotations,
    defaultAnnotations,
    onAnnotationsChange,
    onSelectionChange,
  })
  const [auxiliarySidebarActive, setAuxiliarySidebarActive] = useState(false)
  const {
    clearSelection,
    containerRef: engineRef,
    handleKeyboardEvent: handleReaderKeyboardEvent,
    reportError,
    run,
    setRegionSelectionEnabled,
    state: {
      adapter: adapterState,
      error,
      ocrStatus,
      regionSelectionActive,
      selection,
      status,
    },
  } = useReaderSessionEngine({
    annotations: annotationWorkflow.annotations,
    arrowKeyPageTurning,
    initialPosition,
    pageMode,
    initialPresentationMode,
    ocrProvider,
    onAnnotationActivate: annotationWorkflow.activateAnnotation,
    onError,
    onLocationChange,
    onOcrStatusChange,
    onPositionChange,
    onSelectionChange: annotationWorkflow.selectionChanged,
    regionAnnotationLabel: () => t('reader.openAreaAnnotation'),
    source,
  })
  const viewportRef = useRef<HTMLDivElement>(null)
  const annotationCardsRef = useRef(new Map<string, HTMLElement>())
  const annotationTopicCreationControllersRef = useRef(new Map<string, AbortController>())
  const imageOcclusionControllersRef = useRef(new Map<string, AbortController>())
  const mountedRef = useRef(true)
  const initialNavigationRef = useRef<string | null>(null)
  const [creatingTopicIds, setCreatingTopicIds] = useState<ReadonlySet<string>>(() => new Set())
  const [openingImageOcclusionIds, setOpeningImageOcclusionIds] = useState<ReadonlySet<string>>(() => new Set())
  const [deletingAnnotationId, setDeletingAnnotationId] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const commands = useReaderSessionCommands({
    annotationEditingEnabled,
    clearSelection,
    handleReaderKeyboardEvent,
    onCreateHighlight: annotationWorkflow.createHighlight,
    regionSelectionActive,
    reportError,
    selection,
    setRegionSelectionEnabled,
  })

  const selectReaderSidebarTab = useCallback((tab: 'annotations' | 'contents') => {
    setAuxiliarySidebarActive(false)
    annotationWorkflow.setSidebarTab(tab)
    if (!annotationWorkflow.annotationPanelOpen)
      annotationWorkflow.toggleAnnotationPanel()
  }, [annotationWorkflow])
  const toggleReaderSidebar = useCallback(() => {
    if (auxiliarySidebarActive) {
      setAuxiliarySidebarActive(false)
      annotationWorkflow.setSidebarTab('contents')
      annotationWorkflow.toggleAnnotationPanel()
      return
    }
    annotationWorkflow.toggleAnnotationPanel()
  }, [annotationWorkflow, auxiliarySidebarActive])
  const toggleAuxiliarySidebar = useCallback(() => {
    if (auxiliarySidebar === undefined)
      throw new Error('Cannot toggle an auxiliary sidebar that was not provided')
    if (auxiliarySidebarActive) {
      setAuxiliarySidebarActive(false)
      return
    }
    if (annotationWorkflow.annotationPanelOpen)
      annotationWorkflow.toggleAnnotationPanel()
    setAuxiliarySidebarActive(true)
  }, [annotationWorkflow, auxiliarySidebar, auxiliarySidebarActive])
  const renderedSidebarActions = typeof sidebarActions === 'function'
    ? sidebarActions({ active: auxiliarySidebarActive, toggle: toggleAuxiliarySidebar })
    : sidebarActions

  const activeAnnotation = annotationWorkflow.activeAnnotationId === null
    ? null
    : annotationWorkflow.annotations.find(annotation => annotation.id === annotationWorkflow.activeAnnotationId) ?? null
  const linkedAnnotations = useMemo(
    () => annotationWorkflow.annotations.filter(annotation => annotation.annotationTopicId !== undefined),
    [annotationWorkflow.annotations],
  )
  const activeRect = useAnnotationClientRect(
    engineRef,
    annotationWorkflow.activeAnnotationId,
    adapterState,
  )
  const progress = Math.round(Math.min(1, Math.max(0, adapterState.location.progression)) * 100)
  const bookTitle = annotationCopyBookTitle?.trim() || source.name?.trim() || undefined

  useEffect(() => {
    const controllers = annotationTopicCreationControllersRef.current
    const imageOcclusionControllers = imageOcclusionControllersRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const [annotationId, controller] of controllers) {
        controller.abort(new Error(`Reader closed while creating annotation Topic for ${annotationId}`))
      }
      controllers.clear()
      for (const [annotationId, controller] of imageOcclusionControllers) {
        controller.abort(new Error(`Reader closed while opening image occlusion for ${annotationId}`))
      }
      imageOcclusionControllers.clear()
    }
  }, [])

  useEffect(() => {
    if (status !== 'ready'
      || initialAnnotationId === undefined
      || initialNavigationRef.current === initialAnnotationId
      || !annotationWorkflow.annotations.some(annotation => annotation.id === initialAnnotationId)) {
      return
    }
    annotationWorkflow.activateAnnotation(initialAnnotationId)
    if (run(adapter => adapter.goToAnnotation(initialAnnotationId)))
      initialNavigationRef.current = initialAnnotationId
  }, [annotationWorkflow, initialAnnotationId, run, status])

  const copyAnnotation = useCallback((annotation: ReaderAnnotation) => {
    const location = readerAnnotationLabel(annotation, t)
    const text = annotationCopyText(annotation, annotationCopyFormat, bookTitle, location)
    void navigator.clipboard.writeText(text).catch(reportError)
  }, [annotationCopyFormat, bookTitle, reportError, t])

  const addAnnotationTopic = useCallback((annotation: ReaderAnnotation) => {
    if (!onCreateAnnotationTopic) {
      reportError(new Error('Reader annotation Topic creation is unavailable'))
      return
    }
    const engine = engineRef.current
    if (!engine) {
      reportError(new Error('Reader annotation surface is unavailable'))
      return
    }
    const clientRect = findAnnotationClientRect(engine, annotation.id)
    if (!clientRect) {
      reportError(new Error(`Reader annotation ${annotation.id} is not visible`))
      return
    }
    const controllers = annotationTopicCreationControllersRef.current
    if (controllers.has(annotation.id))
      return
    const controller = new AbortController()
    controllers.set(annotation.id, controller)
    setCreatingTopicIds((current) => {
      const next = new Set(current)
      next.add(annotation.id)
      return next
    })
    void onCreateAnnotationTopic({
      annotation,
      clientRect,
      location: readerAnnotationLabel(annotation, t),
    }, controller.signal)
      .then((topicId) => {
        controller.signal.throwIfAborted()
        annotationWorkflow.attachAnnotationTopic(annotation.id, topicId)
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          reportError(error)
      })
      .finally(() => {
        if (controllers.get(annotation.id) === controller)
          controllers.delete(annotation.id)
        if (!mountedRef.current)
          return
        setCreatingTopicIds((current) => {
          if (!current.has(annotation.id))
            return current
          const next = new Set(current)
          next.delete(annotation.id)
          return next
        })
      })
  }, [annotationWorkflow, engineRef, onCreateAnnotationTopic, reportError, t])

  const openReaderRegionImageOcclusion = useCallback((annotation: ReaderAnnotation) => {
    if (annotation.anchors[0].type !== 'region')
      throw new TypeError(`Reader annotation ${annotation.id} is not a region`)
    if (!onOpenReaderRegionImageOcclusion) {
      reportError(new Error('Reader region image occlusion is unavailable'))
      return
    }
    const engine = engineRef.current
    if (!engine) {
      reportError(new Error('Reader annotation surface is unavailable'))
      return
    }
    const clientRect = findAnnotationClientRect(engine, annotation.id)
    if (!clientRect) {
      reportError(new Error(`Reader annotation ${annotation.id} is not visible`))
      return
    }
    const controllers = imageOcclusionControllersRef.current
    if (controllers.has(annotation.id))
      return
    const controller = new AbortController()
    controllers.set(annotation.id, controller)
    setOpeningImageOcclusionIds((current) => {
      const next = new Set(current)
      next.add(annotation.id)
      return next
    })
    void onOpenReaderRegionImageOcclusion({
      annotation,
      clientRect,
      location: readerAnnotationLabel(annotation, t),
    }, controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted)
          reportError(error)
      })
      .finally(() => {
        if (controllers.get(annotation.id) === controller)
          controllers.delete(annotation.id)
        if (!mountedRef.current)
          return
        setOpeningImageOcclusionIds((current) => {
          if (!current.has(annotation.id))
            return current
          const next = new Set(current)
          next.delete(annotation.id)
          return next
        })
      })
  }, [engineRef, onOpenReaderRegionImageOcclusion, reportError, t])

  const requestDeleteAnnotation = useCallback((annotation: ReaderAnnotation) => {
    const dependents = onGetAnnotationDependents?.(annotation) ?? {
      ...(annotation.annotationTopicId === undefined ? {} : { annotationTopicId: annotation.annotationTopicId }),
      imageOcclusionTopicIds: [],
    }
    requestReaderAnnotationDeletion(dependents, {
      hasPendingWork: annotationTopicCreationControllersRef.current.has(annotation.id)
        || imageOcclusionControllersRef.current.has(annotation.id),
      abortInProgress: () => {
        annotationTopicCreationControllersRef.current.get(annotation.id)?.abort(
          new Error(`Reader annotation ${annotation.id} was deleted while its Topic was being created`),
        )
        imageOcclusionControllersRef.current.get(annotation.id)?.abort(
          new Error(`Reader annotation ${annotation.id} was deleted while its image occlusion was opening`),
        )
      },
      removeAnnotation: () => annotationWorkflow.removeAnnotation(annotation.id),
      requestConfirmation: () => setDeletingAnnotationId(annotation.id),
    })
  }, [annotationWorkflow, onGetAnnotationDependents])

  const finishLinkedDeletion = useCallback(() => {
    if (deletingAnnotationId === null)
      throw new Error('No linked Reader annotation is pending deletion')
    const annotation = annotationWorkflow.annotations.find(candidate => candidate.id === deletingAnnotationId)
    if (!annotation)
      throw new Error(`Reader annotation ${deletingAnnotationId} does not exist`)
    setDeletePending(true)
    let prepareDeletion: Promise<void>
    try {
      prepareDeletion = startReaderAnnotationDeletionPreparation(
        annotation,
        {
          onDetachAnnotationTopic,
          onPrepareAnnotationDeletion,
        },
        () => {
          annotationTopicCreationControllersRef.current.get(annotation.id)?.abort(
            new Error(`Reader annotation ${annotation.id} was deleted while its Topic was being created`),
          )
          imageOcclusionControllersRef.current.get(annotation.id)?.abort(
            new Error(`Reader annotation ${annotation.id} was deleted while its image occlusion was opening`),
          )
        },
      )
    }
    catch (error) {
      reportError(error)
      setDeletePending(false)
      return
    }
    void prepareDeletion
      .then(() => {
        annotationWorkflow.removeAnnotation(annotation.id)
        setDeletingAnnotationId(null)
      })
      .catch(reportError)
      .finally(() => setDeletePending(false))
  }, [annotationWorkflow, deletingAnnotationId, onDetachAnnotationTopic, onPrepareAnnotationDeletion, reportError])

  return (
    <div
      {...stylex.props(readerStyles.root, chrome === 'window' && readerStyles.rootWindow)}
      aria-label={ariaLabel ?? t('reader.ariaLabel')}
      tabIndex={0}
    >
      <ReaderToolbar
        adapterState={adapterState}
        annotationCount={annotationWorkflow.annotations.length}
        annotationEditingEnabled={annotationEditingEnabled}
        annotationPanelOpen={annotationWorkflow.annotationPanelOpen}
        chrome={chrome}
        regionSelectionActive={regionSelectionActive}
        run={run}
        sourceName={source.name}
        sidebarActions={renderedSidebarActions}
        status={status}
        title={title}
        toolbarActions={toolbarActions}
        onToggleAnnotationPanel={toggleReaderSidebar}
        onToggleRegionSelection={commands.toggleRegionSelection}
        ocrStatus={ocrStatus}
      />

      <div ref={viewportRef} {...stylex.props(readerStyles.viewport)}>
        <div {...stylex.props(readerStyles.enginePane)}>
          <div ref={engineRef} {...stylex.props(readerStyles.engine)} />
          {status !== 'ready'
            ? (
                <div
                  {...stylex.props(readerStyles.overlay, status === 'error' && readerStyles.error)}
                  aria-live="polite"
                  role={status === 'error' ? 'alert' : 'status'}
                >
                  {status === 'error' ? error?.message : t('reader.openingDocument')}
                </div>
              )
            : null}
        </div>

        <ReaderSidebar
          activeAnnotationId={annotationWorkflow.activeAnnotationId}
          adapterState={adapterState}
          annotationEditingEnabled={annotationEditingEnabled}
          annotationPanelOpen={annotationWorkflow.annotationPanelOpen || auxiliarySidebarActive}
          annotationRenderLimit={annotationWorkflow.annotationRenderLimit}
          annotations={annotationWorkflow.annotations}
          imageOcclusionOverlays={imageOcclusionOverlays}
          renderAnnotationEditor={renderAnnotationEditor === undefined
            ? undefined
            : (annotation, readOnly) => renderAnnotationEditor({ annotation, readOnly })}
          run={run}
          sidebarTab={annotationWorkflow.sidebarTab}
          onActivateAnnotation={annotationWorkflow.activateAnnotation}
          onLoadMoreAnnotations={(event) => {
            const element = event.currentTarget
            if (element.scrollHeight - element.scrollTop - element.clientHeight <= 240)
              annotationWorkflow.loadMoreAnnotations()
          }}
          onSelectAnnotation={(annotationId) => {
            annotationWorkflow.activateAnnotation(annotationId)
            run(adapter => adapter.goToAnnotation(annotationId))
          }}
          auxiliarySidebar={auxiliarySidebar}
          auxiliarySidebarActive={auxiliarySidebarActive}
          onAuxiliarySidebarSelect={() => {
            if (!auxiliarySidebarActive)
              toggleAuxiliarySidebar()
          }}
          onTabChange={selectReaderSidebarTab}
          registerAnnotationCard={(annotationId, element) => {
            if (element)
              annotationCardsRef.current.set(annotationId, element)
            else
              annotationCardsRef.current.delete(annotationId)
          }}
        />
        <ReaderImageOcclusionOverlays
          engineRef={engineRef}
          imageOcclusionOverlays={imageOcclusionOverlays}
          layoutKey={adapterState}
          viewportRef={viewportRef}
        />
        <ReaderAnnotationConnectors
          activeAnnotationId={annotationWorkflow.activeAnnotationId}
          adapterState={adapterState}
          annotations={linkedAnnotations}
          cardElements={annotationCardsRef}
          engineRef={engineRef}
          open={annotationWorkflow.annotationPanelOpen && annotationWorkflow.sidebarTab === 'annotations'}
          viewportRef={viewportRef}
        />
      </div>

      {selection
        ? (
            <ReaderSelectionPopover
              annotationEditingEnabled={annotationEditingEnabled}
              colorPaletteOpen={annotationWorkflow.colorPaletteOpen}
              selectedColor={annotationWorkflow.selectedColor}
              selection={selection}
              onColorPaletteOpenChange={annotationWorkflow.setColorPaletteOpen}
              onCopy={commands.copySelection}
              onCreateHighlight={commands.createHighlight}
              onDismiss={commands.dismissSelection}
              onSelectedColorChange={annotationWorkflow.setSelectedColor}
            />
          )
        : null}

      {activeAnnotation && activeRect
        ? (
            <ReaderAnnotationPopover
              anchorRect={activeRect}
              annotation={activeAnnotation}
              colorPaletteOpen={annotationWorkflow.colorPaletteOpen}
              creatingTopic={creatingTopicIds.has(activeAnnotation.id)}
              onAddAnnotation={() => addAnnotationTopic(activeAnnotation)}
              onColorChange={color => annotationWorkflow.reviseAnnotation(activeAnnotation.id, { color })}
              onColorPaletteOpenChange={annotationWorkflow.setColorPaletteOpen}
              onCopy={() => copyAnnotation(activeAnnotation)}
              onDelete={() => requestDeleteAnnotation(activeAnnotation)}
              onDismiss={annotationWorkflow.dismissAnnotation}
              onOpenImageOcclusion={onOpenReaderRegionImageOcclusion === undefined
                ? undefined
                : () => openReaderRegionImageOcclusion(activeAnnotation)}
              onStyleChange={style => annotationWorkflow.reviseAnnotation(activeAnnotation.id, { style })}
              openingImageOcclusion={openingImageOcclusionIds.has(activeAnnotation.id)}
            />
          )
        : null}

      {deletingAnnotationId === null
        ? null
        : (
            <ReaderDeleteAnnotationDialog
              pending={deletePending}
              onCancel={() => setDeletingAnnotationId(null)}
              onConfirm={finishLinkedDeletion}
            />
          )}

      <div {...stylex.props(readerStyles.footer)} aria-hidden="true">
        <div {...stylex.props(readerStyles.progress)} style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

export function Reader(props: ReaderProps) {
  return <ReaderSession key={readerSourceKey(props.source)} {...props} chrome="embedded" />
}

export function WindowReader(props: ReaderProps) {
  return <ReaderSession key={readerSourceKey(props.source)} {...props} chrome="window" />
}
