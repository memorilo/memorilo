import type { ReactNode, UIEvent } from 'react'
import type { ReaderAdapter, ReaderAdapterState } from './internal/reader-adapter'
import type { ReaderAnnotation, ReaderAuxiliarySidebar } from './types'
import * as stylex from '@stylexjs/stylex'
import { BookOpenText, StickyNote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { readerAnnotationLabel } from './internal/annotation-label'
import { ReaderOutline } from './reader-outline'
import { readerSidebarStyles as readerStyles } from './reader-sidebar.stylex'
import { readerSharedStyles } from './reader-theme.stylex'

export type ReaderSidebarTab = 'annotations' | 'contents'

interface ReaderSidebarProps {
  activeAnnotationId: string | null
  adapterState: ReaderAdapterState
  annotationEditingEnabled: boolean
  annotationPanelOpen: boolean
  annotationRenderLimit: number
  annotations: readonly ReaderAnnotation[]
  auxiliarySidebar?: ReaderAuxiliarySidebar
  auxiliarySidebarActive: boolean
  onActivateAnnotation: (annotationId: string) => void
  onAuxiliarySidebarSelect: () => void
  onLoadMoreAnnotations: (event: UIEvent<HTMLDivElement>) => void
  onSelectAnnotation: (annotationId: string) => void
  onTabChange: (tab: ReaderSidebarTab) => void
  registerAnnotationCard: (annotationId: string, element: HTMLElement | null) => void
  renderAnnotationEditor?: (annotation: ReaderAnnotation, readOnly: boolean) => ReactNode
  run: (operation: (adapter: ReaderAdapter) => Promise<void>) => void
  sidebarTab: ReaderSidebarTab
}

function annotationQuote(annotation: ReaderAnnotation): string | null {
  if (annotation.anchor.type !== 'text')
    return null
  return annotation.anchor.quote.exact
}

function colorStyle(color: ReaderAnnotation['color']) {
  if (color === 'green')
    return readerSharedStyles.colorGreen
  if (color === 'blue')
    return readerSharedStyles.colorBlue
  if (color === 'pink')
    return readerSharedStyles.colorPink
  if (color === 'purple')
    return readerSharedStyles.colorPurple
  return readerSharedStyles.colorYellow
}

export function ReaderSidebar({
  activeAnnotationId,
  adapterState,
  annotationEditingEnabled,
  annotationPanelOpen,
  annotationRenderLimit,
  annotations,
  auxiliarySidebar,
  auxiliarySidebarActive,
  onActivateAnnotation,
  onAuxiliarySidebarSelect,
  onLoadMoreAnnotations,
  onSelectAnnotation,
  onTabChange,
  registerAnnotationCard,
  renderAnnotationEditor,
  run,
  sidebarTab,
}: ReaderSidebarProps) {
  const { t } = useTranslation('common')
  if (annotations.length > 0 && renderAnnotationEditor === undefined)
    throw new Error('Reader annotation Topics require an Editor renderer')

  return (
    <aside
      {...stylex.props(
        readerStyles.annotationPanel,
        !annotationPanelOpen && readerStyles.annotationPanelClosed,
      )}
      aria-label={t('reader.sidebar')}
      aria-hidden={!annotationPanelOpen}
      inert={!annotationPanelOpen}
    >
      <div {...stylex.props(readerStyles.panelHeader)} role="tablist" aria-label={t('reader.sidebarViews')}>
        <button
          {...stylex.props(
            readerStyles.sidebarTab,
            !auxiliarySidebarActive && sidebarTab === 'contents' && readerStyles.sidebarTabActive,
          )}
          aria-controls="reader-contents-panel"
          aria-selected={!auxiliarySidebarActive && sidebarTab === 'contents'}
          role="tab"
          type="button"
          onClick={() => onTabChange('contents')}
        >
          <BookOpenText aria-hidden="true" size={14} strokeWidth={1.8} />
          {t('reader.contents')}
        </button>
        {annotationEditingEnabled
          ? (
              <button
                {...stylex.props(
                  readerStyles.sidebarTab,
                  !auxiliarySidebarActive && sidebarTab === 'annotations' && readerStyles.sidebarTabActive,
                )}
                aria-controls="reader-annotations-panel"
                aria-selected={!auxiliarySidebarActive && sidebarTab === 'annotations'}
                role="tab"
                type="button"
                onClick={() => onTabChange('annotations')}
              >
                <StickyNote aria-hidden="true" size={14} strokeWidth={1.8} />
                {t('reader.annotations')}
                {annotations.length > 0
                  ? <span {...stylex.props(readerStyles.tabCount)}>{annotations.length}</span>
                  : null}
              </button>
            )
          : null}
        {auxiliarySidebar !== undefined
          ? (
              <button
                {...stylex.props(readerStyles.sidebarTab, auxiliarySidebarActive && readerStyles.sidebarTabActive)}
                aria-controls="reader-auxiliary-panel"
                aria-selected={auxiliarySidebarActive}
                role="tab"
                type="button"
                onClick={onAuxiliarySidebarSelect}
              >
                {auxiliarySidebar.icon}
                {auxiliarySidebar.label}
              </button>
            )
          : null}
      </div>

      {auxiliarySidebarActive && auxiliarySidebar !== undefined
        ? (
            <div
              id="reader-auxiliary-panel"
              {...stylex.props(readerStyles.panelContent, readerStyles.auxiliaryPanel)}
              role="tabpanel"
            >
              {auxiliarySidebar.content}
            </div>
          )
        : sidebarTab === 'contents'
          ? (
              <div id="reader-contents-panel" {...stylex.props(readerStyles.panelContent)} role="tabpanel">
                {adapterState.outline.length === 0
                  ? <div {...stylex.props(readerStyles.emptyAnnotations)}>{t('reader.noContents')}</div>
                  : (
                      <ReaderOutline
                        key={`${adapterState.title}:${adapterState.outline.length}`}
                        currentHref={adapterState.location.href}
                        items={adapterState.outline}
                        onNavigate={itemId => run((adapter) => {
                          if (!adapter.goToOutlineItem)
                            throw new Error('The reader exposed an outline without providing its navigation command')
                          return adapter.goToOutlineItem(itemId)
                        })}
                      />
                    )}
              </div>
            )
          : (
              <div
                id="reader-annotations-panel"
                {...stylex.props(readerStyles.annotationList)}
                role="tabpanel"
                onScroll={onLoadMoreAnnotations}
              >
                {annotations.length === 0
                  ? <div {...stylex.props(readerStyles.emptyAnnotations)}>{t('reader.noAnnotations')}</div>
                  : annotations.slice(0, annotationRenderLimit).map((annotation) => {
                      const quote = annotationQuote(annotation)
                      const active = activeAnnotationId === annotation.id
                      return (
                        <article
                          key={annotation.id}
                          ref={element => registerAnnotationCard(annotation.id, element)}
                          {...stylex.props(
                            readerStyles.annotationItem,
                            active && readerStyles.annotationItemActive,
                          )}
                          onPointerDown={() => onActivateAnnotation(annotation.id)}
                        >
                          <button
                            {...stylex.props(readerStyles.annotationTarget)}
                            type="button"
                            onClick={() => onSelectAnnotation(annotation.id)}
                          >
                            <span {...stylex.props(readerStyles.annotationDot, colorStyle(annotation.color))} />
                            <span {...stylex.props(readerStyles.annotationMeta)}>
                              {readerAnnotationLabel(annotation, t)}
                            </span>
                          </button>
                          {quote
                            ? <blockquote {...stylex.props(readerStyles.annotationQuote)}>{quote}</blockquote>
                            : null}
                          <div {...stylex.props(readerStyles.annotationEditor)}>
                            {renderAnnotationEditor?.(annotation, !active)}
                          </div>
                        </article>
                      )
                    })}
              </div>
            )}
    </aside>
  )
}
