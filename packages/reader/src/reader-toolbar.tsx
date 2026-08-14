import type { ReactNode } from 'react'
import type { ReaderAdapterState } from './internal/reader-adapter'
import type { ReaderSessionEngine } from './internal/reader-session-engine'
import type { ReaderOcrStatus, ReaderScaleCapability } from './types'
import * as stylex from '@stylexjs/stylex'
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ScanLine,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { readerShellStyles as readerStyles } from './reader-shell.stylex'

export type ReaderChrome = 'embedded' | 'window'

interface ReaderToolbarProps {
  adapterState: ReaderAdapterState
  annotationCount: number
  annotationEditingEnabled: boolean
  annotationPanelOpen: boolean
  chrome: ReaderChrome
  ocrStatus: ReaderOcrStatus | null
  onToggleAnnotationPanel: () => void
  onToggleRegionSelection: () => void
  regionSelectionActive: boolean
  run: ReaderSessionEngine['run']
  sidebarActions?: ReactNode
  sourceName?: string
  status: ReaderSessionEngine['state']['status']
  title?: string
  toolbarActions?: ReactNode
}

function scaleActionLabel(
  capability: ReaderScaleCapability,
  direction: 'in' | 'out',
  t: ReturnType<typeof useTranslation<'common'>>['t'],
): string {
  if (capability.kind === 'zoom')
    return direction === 'in' ? t('reader.zoomIn') : t('reader.zoomOut')
  return direction === 'in' ? t('reader.increaseTextSize') : t('reader.decreaseTextSize')
}

export function ReaderToolbar({
  adapterState,
  annotationCount,
  annotationEditingEnabled,
  annotationPanelOpen,
  chrome,
  ocrStatus,
  onToggleAnnotationPanel,
  onToggleRegionSelection,
  regionSelectionActive,
  run,
  sidebarActions,
  sourceName,
  status,
  title,
  toolbarActions,
}: ReaderToolbarProps) {
  const { t } = useTranslation('common')
  const scaleCapability = adapterState.capabilities.scale
  const displayTitle = title || adapterState.title || sourceName || t('reader.document')
  const sidebarLabel = annotationEditingEnabled
    ? annotationPanelOpen ? t('reader.hideSidebar') : t('reader.showSidebar')
    : annotationPanelOpen ? t('reader.hideContents') : t('reader.showContents')
  const currentOcrState = adapterState.position.format === 'pdf'
    && ocrStatus?.pageNumber === adapterState.position.pageNumber
    ? ocrStatus.state
    : undefined
  const sidebarButton = (
    <button
      {...stylex.props(
        readerStyles.button,
        chrome === 'window' && readerStyles.buttonWindow,
        annotationPanelOpen && readerStyles.buttonActive,
      )}
      aria-label={sidebarLabel}
      aria-pressed={annotationPanelOpen}
      data-window-no-drag=""
      title={sidebarLabel}
      type="button"
      onClick={onToggleAnnotationPanel}
    >
      <BookOpenText aria-hidden="true" size={16} strokeWidth={1.8} />
      {annotationCount > 0
        ? <span {...stylex.props(readerStyles.annotationBadge)}>{annotationCount}</span>
        : null}
    </button>
  )

  const toolbar = (
    <header {...stylex.props(readerStyles.toolbar, chrome === 'window' && readerStyles.toolbarWindow)}>
      {chrome === 'embedded'
        ? (
            <div {...stylex.props(readerStyles.titleGroup)}>
              <h2 {...stylex.props(readerStyles.title)}>{displayTitle}</h2>
              <span {...stylex.props(readerStyles.format)}>{adapterState.format}</span>
              {adapterState.textLayer === 'ocr'
                ? <span {...stylex.props(readerStyles.statusChip)}>{t('reader.ocrText')}</span>
                : null}
              {currentOcrState === 'recognizing'
                ? <span {...stylex.props(readerStyles.statusChip)}>{t('reader.recognizing')}</span>
                : null}
              {adapterState.textLayer === 'none' && currentOcrState !== 'recognizing' && status === 'ready'
                ? <span {...stylex.props(readerStyles.statusChip)}>{t('reader.imagePage')}</span>
                : null}
            </div>
          )
        : (
            <div {...stylex.props(readerStyles.titleGroup, readerStyles.titleGroupWindow)}>
              <h2 {...stylex.props(readerStyles.title)}>{displayTitle}</h2>
            </div>
          )}

      <div
        {...stylex.props(
          readerStyles.navigation,
          chrome === 'window' && readerStyles.windowControlGroup,
          chrome === 'window' && readerStyles.navigationWindow,
        )}
      >
        <button
          {...stylex.props(readerStyles.button, chrome === 'window' && readerStyles.buttonWindow)}
          aria-label={t('reader.previous')}
          data-window-no-drag=""
          disabled={status !== 'ready' || !adapterState.canGoBackward}
          title={t('reader.previous')}
          type="button"
          onClick={() => run(adapter => adapter.goBackward('end'))}
        >
          <ChevronLeft aria-hidden="true" size={17} strokeWidth={1.9} />
        </button>
        <span {...stylex.props(readerStyles.location)} aria-live="polite">
          {adapterState.location.label || t('reader.opening')}
        </span>
        <button
          {...stylex.props(readerStyles.button, chrome === 'window' && readerStyles.buttonWindow)}
          aria-label={t('reader.next')}
          data-window-no-drag=""
          disabled={status !== 'ready' || !adapterState.canGoForward}
          title={t('reader.next')}
          type="button"
          onClick={() => run(adapter => adapter.goForward('start'))}
        >
          <ChevronRight aria-hidden="true" size={17} strokeWidth={1.9} />
        </button>
      </div>

      <div
        {...stylex.props(
          readerStyles.actions,
          chrome === 'window' && readerStyles.windowControlGroup,
          chrome === 'window' && readerStyles.actionsWindow,
          chrome === 'window' && sidebarActions !== undefined && readerStyles.actionsWindowWithSidebarActions,
        )}
      >
        {sidebarButton}
        {toolbarActions}
        {annotationEditingEnabled && adapterState.capabilities.regionSelection
          ? (
              <button
                {...stylex.props(
                  readerStyles.button,
                  chrome === 'window' && readerStyles.buttonWindow,
                  regionSelectionActive && readerStyles.buttonActive,
                )}
                aria-label={t('reader.selectArea')}
                aria-pressed={regionSelectionActive}
                disabled={status !== 'ready'}
                title={t('reader.selectArea')}
                type="button"
                onClick={onToggleRegionSelection}
              >
                <ScanLine aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            )
          : null}
        {adapterState.capabilities.ocr
          ? (
              <button
                {...stylex.props(readerStyles.button, chrome === 'window' && readerStyles.buttonWindow)}
                aria-label={t('reader.recognizePage')}
                disabled={status !== 'ready' || currentOcrState === 'recognizing'}
                title={t('reader.recognizePage')}
                type="button"
                onClick={() => run((adapter) => {
                  if (!adapter.recognizeCurrentPage)
                    throw new Error('The reader declared OCR without providing its command')
                  return adapter.recognizeCurrentPage()
                })}
              >
                <Sparkles aria-hidden="true" size={15} strokeWidth={1.8} />
              </button>
            )
          : null}
        {scaleCapability
          ? (
              <>
                <button
                  {...stylex.props(readerStyles.button, chrome === 'window' && readerStyles.buttonWindow)}
                  aria-label={scaleActionLabel(scaleCapability, 'out', t)}
                  data-window-no-drag=""
                  disabled={status !== 'ready' || adapterState.scale <= scaleCapability.minimum}
                  title={scaleActionLabel(scaleCapability, 'out', t)}
                  type="button"
                  onClick={() => run((adapter) => {
                    if (!adapter.setScale)
                      throw new Error('The reader declared scaling without providing its command')
                    return adapter.setScale(adapterState.scale - scaleCapability.step)
                  })}
                >
                  <Minus aria-hidden="true" size={15} strokeWidth={2} />
                </button>
                <button
                  {...stylex.props(readerStyles.button, chrome === 'window' && readerStyles.buttonWindow)}
                  aria-label={scaleActionLabel(scaleCapability, 'in', t)}
                  data-window-no-drag=""
                  disabled={status !== 'ready' || adapterState.scale >= scaleCapability.maximum}
                  title={scaleActionLabel(scaleCapability, 'in', t)}
                  type="button"
                  onClick={() => run((adapter) => {
                    if (!adapter.setScale)
                      throw new Error('The reader declared scaling without providing its command')
                    return adapter.setScale(adapterState.scale + scaleCapability.step)
                  })}
                >
                  <Plus aria-hidden="true" size={15} strokeWidth={2} />
                </button>
              </>
            )
          : null}
      </div>
    </header>
  )
  if (chrome !== 'window' || sidebarActions === undefined)
    return toolbar
  return (
    <>
      {toolbar}
      <div
        {...stylex.props(
          readerStyles.sidebarActions,
          readerStyles.windowControlGroup,
          readerStyles.sidebarActionsWindow,
        )}
        data-window-no-drag=""
      >
        {sidebarActions}
      </div>
    </>
  )
}
