import type { UIEvent } from 'react'
import type { ReaderAdapter, ReaderAdapterState } from './internal/reader-adapter'
import type { ReaderAnnotation, ReaderNote } from './types'
import * as stylex from '@stylexjs/stylex'
import { BookOpenText, Check, Pencil, StickyNote, Trash2 } from 'lucide-react'
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
  editingAnnotationId: string | null
  editingDraft: string
  onBeginEdit: (annotation: ReaderNote) => void
  onCancelEdit: () => void
  onEditingDraftChange: (draft: string) => void
  onLoadMoreAnnotations: (event: UIEvent<HTMLDivElement>) => void
  onRemoveAnnotation: (annotationId: string) => void
  onSaveEditedAnnotation: () => void
  onSelectAnnotation: (annotationId: string) => void
  onTabChange: (tab: ReaderSidebarTab) => void
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
  editingAnnotationId,
  editingDraft,
  onBeginEdit,
  onCancelEdit,
  onEditingDraftChange,
  onLoadMoreAnnotations,
  onRemoveAnnotation,
  onSaveEditedAnnotation,
  onSelectAnnotation,
  onTabChange,
  run,
  sidebarTab,
}: ReaderSidebarProps) {
  const { t } = useTranslation('common')

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
          {...stylex.props(readerStyles.sidebarTab, sidebarTab === 'contents' && readerStyles.sidebarTabActive)}
          aria-controls="reader-contents-panel"
          aria-selected={sidebarTab === 'contents'}
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
                {...stylex.props(readerStyles.sidebarTab, sidebarTab === 'annotations' && readerStyles.sidebarTabActive)}
                aria-controls="reader-annotations-panel"
                aria-selected={sidebarTab === 'annotations'}
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
      </div>

      {sidebarTab === 'contents'
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
                          onClick={() => onSelectAnnotation(annotation.id)}
                        >
                          <span {...stylex.props(readerStyles.annotationDot, colorStyle(annotation.color))} />
                          <span {...stylex.props(readerStyles.annotationMeta)}>
                            {annotation.kind === 'annotation' ? t('reader.annotationLabel') : t('reader.highlightLabel')}
                            {' · '}
                            {readerAnnotationLabel(annotation, t)}
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
                                    aria-label={t('reader.editAnnotation')}
                                    rows={4}
                                    value={editingDraft}
                                    onChange={event => onEditingDraftChange(event.target.value)}
                                  />
                                  <div {...stylex.props(readerStyles.panelEditorActions)}>
                                    <button
                                      {...stylex.props(readerStyles.textButton)}
                                      type="button"
                                      onClick={onCancelEdit}
                                    >
                                      {t('reader.cancel')}
                                    </button>
                                    <button
                                      {...stylex.props(readerSharedStyles.primaryTextButton)}
                                      disabled={!editingDraft.trim()}
                                      type="button"
                                      onClick={onSaveEditedAnnotation}
                                    >
                                      <Check aria-hidden="true" size={13} />
                                      {t('reader.save')}
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
                                        aria-label={t('reader.editAnnotation')}
                                        type="button"
                                        onClick={() => onBeginEdit(annotation)}
                                      >
                                        <Pencil aria-hidden="true" size={13} />
                                      </button>
                                    )
                                  : null}
                                <button
                                  {...stylex.props(readerStyles.itemButton, readerStyles.deleteButton)}
                                  aria-label={t('reader.deleteAnnotation')}
                                  type="button"
                                  onClick={() => onRemoveAnnotation(annotation.id)}
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
          )}
    </aside>
  )
}
