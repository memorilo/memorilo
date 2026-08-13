import type { ReaderAnnotation, ReaderProps } from './types'
import * as stylex from '@stylexjs/stylex'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReaderSessionEngine } from './internal/reader-session-engine'
import { useReaderAnnotationWorkflow } from './reader-annotation-workflow'
import { ReaderSelectionPopover } from './reader-selection-popover'
import { useReaderSessionCommands } from './reader-session-commands'
import { readerShellStyles as readerStyles } from './reader-shell.stylex'
import { ReaderSidebar } from './reader-sidebar'
import { ReaderToolbar } from './reader-toolbar'

const noAnnotations: readonly ReaderAnnotation[] = []
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

interface ReaderSessionProps extends ReaderProps {
  chrome: 'embedded' | 'window'
}

function ReaderSession({
  annotationEditingEnabled = true,
  annotations,
  ariaLabel,
  arrowKeyPageTurning = true,
  auxiliarySidebar,
  chrome,
  defaultAnnotations = noAnnotations,
  initialPosition,
  initialPresentationMode = 'publisher',
  ocrProvider,
  onAnnotationsChange,
  onError,
  onLocationChange,
  onOcrStatusChange,
  onPositionChange,
  onSelectionChange,
  sidebarActions,
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

  const commands = useReaderSessionCommands({
    annotationEditingEnabled,
    clearSelection,
    handleReaderKeyboardEvent,
    onCreateHighlight: annotationWorkflow.createHighlight,
    onCreateNote: annotationWorkflow.createNote,
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

  const progress = Math.round(Math.min(1, Math.max(0, adapterState.location.progression)) * 100)

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
          editingAnnotationId={annotationWorkflow.editingAnnotationId}
          editingDraft={annotationWorkflow.editingDraft}
          run={run}
          sidebarTab={annotationWorkflow.sidebarTab}
          onBeginEdit={annotationWorkflow.beginEditAnnotation}
          onCancelEdit={annotationWorkflow.cancelEditAnnotation}
          onEditingDraftChange={annotationWorkflow.setEditingDraft}
          onLoadMoreAnnotations={(event) => {
            const element = event.currentTarget
            if (element.scrollHeight - element.scrollTop - element.clientHeight <= 240)
              annotationWorkflow.loadMoreAnnotations()
          }}
          onRemoveAnnotation={annotationWorkflow.removeAnnotation}
          onSaveEditedAnnotation={annotationWorkflow.saveEditedAnnotation}
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
        />
      </div>

      {selection
        ? (
            <ReaderSelectionPopover
              annotationEditingEnabled={annotationEditingEnabled}
              colorPaletteOpen={annotationWorkflow.colorPaletteOpen}
              noteComposerOpen={annotationWorkflow.noteComposerOpen}
              noteDraft={annotationWorkflow.noteDraft}
              selectedColor={annotationWorkflow.selectedColor}
              selection={selection}
              onColorPaletteOpenChange={annotationWorkflow.setColorPaletteOpen}
              onCopy={commands.copySelection}
              onCreateHighlight={commands.createHighlight}
              onCreateNote={commands.createNote}
              onDismiss={commands.dismissSelection}
              onNoteComposerOpenChange={annotationWorkflow.setNoteComposerOpen}
              onNoteDraftChange={annotationWorkflow.setNoteDraft}
              onSelectedColorChange={annotationWorkflow.setSelectedColor}
            />
          )
        : null}

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
