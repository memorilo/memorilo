import type { DesktopBookTopicContextSummary, DesktopBookTopicReadingContext } from '@memorilo/desktop-preload'
import type { ReaderAnnotation, ReaderPosition, ReaderSource } from '@memorilo/editor/reader'
import { createEditorNote } from '@memorilo/editor'
import { WindowReader } from '@memorilo/editor/reader'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { AlertCircle, BookOpen, LoaderCircle, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify/unstyled'

import { usePageTitlebar } from '../components/page-titlebar'
import { useDesktopConfiguration } from '../configuration-context'
import { useFlushNotePersistence, useNotePersistence } from '../note-persistence-hooks'
import { readerRouteStyles } from './-reader.stylex'
import { desktopEffect, shelfEffectQuery } from './-shelf-data'

const shelfReaderRouteApi = getRouteApi('/reader_/$readingId')

interface BookTitleDraft {
  noteTitle: string
  topicTitle: string
}

interface RequestedBookContext {
  noteId: string
  topicId: string
}

type ShelfReaderSearch
  = | RequestedBookContext
    | { noteId?: undefined, topicId?: undefined }

function validateShelfReaderSearch(search: Record<string, unknown>): ShelfReaderSearch {
  if (search.noteId === undefined && search.topicId === undefined)
    return {}
  if (typeof search.noteId !== 'string' || search.noteId.trim().length === 0)
    throw new TypeError('Reader Note id must be a non-empty string')
  if (typeof search.topicId !== 'string' || search.topicId.trim().length === 0)
    throw new TypeError('Reader BookTopic id must be a non-empty string')
  return { noteId: search.noteId, topicId: search.topicId }
}

function normalizedTitle(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

function readerTitle(context: DesktopBookTopicReadingContext | null, fallback: string): string {
  if (!context)
    return fallback
  const noteTitle = context.note.title.trim()
  const topicTitle = context.topicTitle.trim()
  return normalizedTitle(noteTitle) === normalizedTitle(topicTitle)
    ? noteTitle
    : `${noteTitle} · ${topicTitle}`
}

function sameBoundFile(
  left: DesktopBookTopicContextSummary['book']['file'],
  right: DesktopBookTopicContextSummary['book']['file'],
): boolean {
  return left.format === right.format && left.sha256 === right.sha256
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function DuplicateTitleToast({ onEdit, t }: { onEdit: () => void, t: (key: string) => string }) {
  return (
    <div>
      <span>{t('reader.duplicateTitle')}</span>
      <button type="button" onClick={onEdit}>{t('reader.edit')}</button>
    </div>
  )
}

function ContextChoiceDialog({
  bookTitle,
  contexts,
  creating,
  onCreate,
  onSelect,
}: {
  bookTitle: string
  contexts: readonly DesktopBookTopicContextSummary[]
  creating: boolean
  onCreate: () => void
  onSelect: (context: DesktopBookTopicContextSummary) => void
}) {
  const { t } = useTranslation('common')
  return (
    <div {...stylex.props(readerRouteStyles.contextOverlay)}>
      <section
        {...stylex.props(readerRouteStyles.contextDialog)}
        aria-describedby="reader-context-description"
        aria-labelledby="reader-context-title"
        aria-modal="true"
        role="dialog"
      >
        <header {...stylex.props(readerRouteStyles.contextHeader)}>
          <h1 id="reader-context-title" {...stylex.props(readerRouteStyles.contextTitle)}>{t('reader.chooseContext')}</h1>
          <p id="reader-context-description" {...stylex.props(readerRouteStyles.contextDescription)}>
            {t('reader.chooseContextDescription', { title: bookTitle })}
          </p>
        </header>
        <div {...stylex.props(readerRouteStyles.contextBody)}>
          {contexts.map(context => (
            <button
              key={`${context.noteId}:${context.topicId}`}
              {...stylex.props(readerRouteStyles.contextOption)}
              disabled={creating}
              type="button"
              onClick={() => onSelect(context)}
            >
              <span {...stylex.props(readerRouteStyles.contextOptionText)}>
                <span {...stylex.props(readerRouteStyles.contextOptionTitle)}>{context.noteTitle}</span>
                <span {...stylex.props(readerRouteStyles.contextOptionDetail)}>{context.topicTitle}</span>
              </span>
              <span {...stylex.props(readerRouteStyles.contextOptionFormat)}>{context.book.file.format}</span>
            </button>
          ))}
          <button
            {...stylex.props(readerRouteStyles.contextCreateButton)}
            disabled={creating}
            type="button"
            onClick={onCreate}
          >
            <Plus aria-hidden="true" size={15} strokeWidth={2} />
            {t('reader.createContext')}
          </button>
        </div>
      </section>
    </div>
  )
}

function CreateBookDialog({
  creating,
  draft,
  error,
  onCancel,
  onChange,
  onSubmit,
}: {
  creating: boolean
  draft: BookTitleDraft
  error: string | null
  onCancel: () => void
  onChange: (field: keyof BookTitleDraft, value: string) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <div {...stylex.props(readerRouteStyles.contextOverlay)}>
      <section
        {...stylex.props(readerRouteStyles.contextDialog)}
        aria-describedby="reader-create-description"
        aria-labelledby="reader-create-title"
        aria-modal="true"
        role="dialog"
      >
        <header {...stylex.props(readerRouteStyles.contextHeader)}>
          <h1 id="reader-create-title" {...stylex.props(readerRouteStyles.contextTitle)}>{t('reader.createContext')}</h1>
          <p id="reader-create-description" {...stylex.props(readerRouteStyles.contextDescription)}>
            {t('reader.createContextDescription')}
          </p>
        </header>
        <form
          {...stylex.props(readerRouteStyles.contextForm)}
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <label {...stylex.props(readerRouteStyles.contextField)}>
            <span {...stylex.props(readerRouteStyles.contextLabel)}>{t('reader.noteTitle')}</span>
            <input
              {...stylex.props(readerRouteStyles.contextInput)}
              autoFocus
              disabled={creating}
              value={draft.noteTitle}
              onChange={event => onChange('noteTitle', event.target.value)}
            />
          </label>
          <label {...stylex.props(readerRouteStyles.contextField)}>
            <span {...stylex.props(readerRouteStyles.contextLabel)}>{t('reader.bookTopicTitle')}</span>
            <input
              {...stylex.props(readerRouteStyles.contextInput)}
              disabled={creating}
              value={draft.topicTitle}
              onChange={event => onChange('topicTitle', event.target.value)}
            />
          </label>
          {error
            ? <p {...stylex.props(readerRouteStyles.contextError)} role="alert">{error}</p>
            : null}
          <footer {...stylex.props(readerRouteStyles.contextFooter)}>
            <button
              {...stylex.props(readerRouteStyles.contextCancelButton)}
              disabled={creating}
              type="button"
              onClick={onCancel}
            >
              {t('reader.cancel')}
            </button>
            <button
              {...stylex.props(readerRouteStyles.contextCreateButton)}
              disabled={creating || draft.noteTitle.trim().length === 0 || draft.topicTitle.trim().length === 0}
              type="submit"
            >
              {creating ? t('reader.creatingContext') : t('reader.createContext')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

function ConfirmRebindDialog({
  creating,
  onCancel,
  onConfirm,
}: {
  creating: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <div {...stylex.props(readerRouteStyles.contextOverlay)}>
      <section
        {...stylex.props(readerRouteStyles.contextDialog)}
        aria-describedby="reader-rebind-description"
        aria-labelledby="reader-rebind-title"
        aria-modal="true"
        role="dialog"
      >
        <header {...stylex.props(readerRouteStyles.contextHeader)}>
          <h1 id="reader-rebind-title" {...stylex.props(readerRouteStyles.contextTitle)}>{t('reader.rebindTitle')}</h1>
          <p id="reader-rebind-description" {...stylex.props(readerRouteStyles.contextDescription)}>
            {t('reader.rebindWarning')}
          </p>
        </header>
        <footer {...stylex.props(readerRouteStyles.contextFooter)}>
          <button
            {...stylex.props(readerRouteStyles.contextCancelButton)}
            disabled={creating}
            type="button"
            onClick={onCancel}
          >
            {t('reader.cancel')}
          </button>
          <button
            {...stylex.props(readerRouteStyles.contextCreateButton)}
            disabled={creating}
            type="button"
            onClick={onConfirm}
          >
            {creating ? t('reader.rebinding') : t('reader.rebindAnyway')}
          </button>
        </footer>
      </section>
    </div>
  )
}

function BoundShelfReader({
  configuration,
  context,
  initialPosition,
  sessionId,
  source,
}: {
  configuration: ReturnType<typeof useDesktopConfiguration>
  context: DesktopBookTopicReadingContext
  initialPosition: ReaderPosition | null
  sessionId: string
  source: ReaderSource
}) {
  const { enqueue, getPendingChanges } = useNotePersistence(context.note.id)
  const flush = useFlushNotePersistence()
  const note = useMemo(() => {
    const restored = createEditorNote({
      id: context.note.id,
      snapshot: context.note.snapshot,
      title: context.note.title,
    })
    getPendingChanges().forEach(change => restored.importUpdates(change.update))
    return restored
  }, [context.note.id, context.note.snapshot, context.note.title, getPendingChanges])
  const bookTopic = useMemo(() => note.getBookTopic(context.topicId), [context.topicId, note])
  const initialReadingState = useRef(bookTopic.getReadingState()).current
  const initialReaderPosition = useRef(initialReadingState.position ?? initialPosition).current
  const [annotations, setAnnotations] = useState(initialReadingState.annotations)
  const positionRef = useRef(initialReadingState.position)
  const annotationsRef = useRef(initialReadingState.annotations)

  const syncReadingState = useCallback(() => {
    const next = bookTopic.getReadingState()
    positionRef.current = next.position
    annotationsRef.current = next.annotations
    setAnnotations(next.annotations)
  }, [bookTopic])
  const handleNoteChange = useCallback((change: { noteId: string, update: Uint8Array }) => {
    enqueue(change)
    syncReadingState()
  }, [enqueue, syncReadingState])

  useEffect(() => {
    const unsubscribeLocal = note.subscribe(handleNoteChange)
    const unsubscribeExternal = window.desktop.subscribeNoteUpdates((update) => {
      if (update.noteId !== note.id)
        return
      note.importUpdates(update.update)
      syncReadingState()
    })
    if (initialReadingState.position === null && initialReaderPosition !== null)
      bookTopic.setPosition(initialReaderPosition)
    return () => {
      unsubscribeLocal()
      unsubscribeExternal()
    }
  }, [bookTopic, handleNoteChange, initialReaderPosition, initialReadingState.position, note, syncReadingState])

  useEffect(() => () => {
    void flush().catch(() => undefined).finally(() => {
      void window.desktop.closeBookReadingSession(sessionId)
    })
  }, [flush, sessionId])

  const onPositionChange = useCallback((position: ReaderPosition) => {
    if (JSON.stringify(position) === JSON.stringify(positionRef.current))
      return
    bookTopic.setPosition(position)
  }, [bookTopic])
  const onAnnotationsChange = useCallback((annotations: readonly ReaderAnnotation[]) => {
    if (JSON.stringify(annotations) === JSON.stringify(annotationsRef.current))
      return
    bookTopic.setAnnotations(annotations)
  }, [bookTopic])

  return (
    <WindowReader
      annotationEditingEnabled
      annotations={annotations}
      arrowKeyPageTurning={configuration.readerArrowKeyPageTurning}
      initialPosition={initialReaderPosition}
      initialPresentationMode={configuration.readerEpubPresentationMode}
      source={source}
      title={readerTitle(context, context.book.book.title)}
      onAnnotationsChange={onAnnotationsChange}
      onPositionChange={onPositionChange}
    />
  )
}

function ShelfReaderSession({
  readingId,
  requestedContext,
}: {
  readingId: string
  requestedContext: RequestedBookContext | null
}) {
  const configuration = useDesktopConfiguration()
  const { t } = useTranslation('common')
  const [context, setContext] = useState<DesktopBookTopicReadingContext | null>(null)
  const [contextInitialPosition, setContextInitialPosition] = useState<ReaderPosition | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [contextChoiceResolved, setContextChoiceResolved] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState<BookTitleDraft>({ noteTitle: '', topicTitle: '' })
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [rebindCandidate, setRebindCandidate] = useState<DesktopBookTopicContextSummary | null>(null)
  const [requestedContextError, setRequestedContextError] = useState<unknown>(null)
  const requestedContextSelectionStartedRef = useRef(false)
  const unboundPositionRef = useRef<ReaderPosition | null>(null)
  const documentQuery = useQuery(shelfEffectQuery.queryOptions({
    gcTime: 0,
    queryFn: () => desktopEffect(() => window.desktop.openShelfReading({ readingId })),
    queryKey: ['shelf-reading', readingId],
    retry: false,
    staleTime: Infinity,
  }))
  const contextsQuery = useQuery(shelfEffectQuery.queryOptions({
    enabled: documentQuery.data !== undefined,
    gcTime: 0,
    queryFn: () => desktopEffect(() => window.desktop.listBookContexts(readingId)),
    queryKey: ['shelf-reading-contexts', readingId],
    retry: false,
    staleTime: Infinity,
  }))
  const source = useMemo<ReaderSource | null>(() => documentQuery.data
    ? {
        byteLength: documentQuery.data.byteLength,
        format: documentQuery.data.format,
        name: documentQuery.data.name,
        read: (offset, length) => window.desktop.readShelfReadingRange({ length, offset, readingId }),
      }
    : null, [documentQuery.data, readingId])
  const fallbackTitle = documentQuery.data?.book.book.title ?? documentQuery.data?.name ?? t('reader.document')
  const contextChooserOpen = requestedContext === null
    && (contextsQuery.data?.length ?? 0) > 0
    && !contextChoiceResolved

  const openCreateForm = useCallback(() => {
    const title = documentQuery.data?.book.book.title ?? documentQuery.data?.name ?? ''
    setCreateDraft({ noteTitle: title, topicTitle: title })
    setCreateError(null)
    setCreateOpen(true)
  }, [documentQuery.data])

  const createContext = useCallback(async (draft: BookTitleDraft) => {
    if (!documentQuery.data)
      throw new Error('The book document is not ready')
    const noteTitle = draft.noteTitle.trim()
    const topicTitle = draft.topicTitle.trim()
    if (!noteTitle || !topicTitle) {
      setCreateError(t('reader.titlesRequired'))
      setCreateOpen(true)
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const result = await window.desktop.createBookContext({ noteTitle, readingId, topicTitle })
      if (result.status === 'duplicate-title') {
        setContextChoiceResolved(true)
        setCreateOpen(false)
        setCreateDraft({ noteTitle, topicTitle })
        toast.error(
          <DuplicateTitleToast onEdit={() => setCreateOpen(true)} t={t} />,
          { autoClose: false },
        )
        return
      }
      setContextInitialPosition(unboundPositionRef.current)
      setContext(result.context)
      setSessionId(result.sessionId)
      setContextChoiceResolved(true)
      setCreateOpen(false)
      toast.success(t('reader.contextCreated'))
    }
    catch (error) {
      setContextChoiceResolved(true)
      setCreateOpen(false)
      toast.error(publicError(error))
    }
    finally {
      setCreating(false)
    }
  }, [documentQuery.data, readingId, t])

  const selectContext = useCallback(async (summary: DesktopBookTopicContextSummary) => {
    const document = documentQuery.data
    if (!document)
      throw new Error('The book document is not ready')
    if (summary.book.file.format !== document.book.file.format)
      throw new Error(t('reader.cannotChangeFormat'))
    if (!sameBoundFile(summary.book.file, document.book.file)) {
      setContextChoiceResolved(true)
      setRebindCandidate(summary)
      return
    }
    setCreating(true)
    try {
      const result = await window.desktop.selectBookContext({
        noteId: summary.noteId,
        readingId,
        topicId: summary.topicId,
      })
      setContextInitialPosition(null)
      setContext(result.context)
      setSessionId(result.sessionId)
      setContextChoiceResolved(true)
    }
    finally {
      setCreating(false)
    }
  }, [documentQuery.data, readingId, t])

  const selectRequestedContext = useCallback(async () => {
    if (requestedContext === null || contextsQuery.data === undefined)
      throw new Error('The requested BookTopic context is not ready')
    const summary = contextsQuery.data.find(candidate => (
      candidate.noteId === requestedContext.noteId && candidate.topicId === requestedContext.topicId
    ))
    if (!summary) {
      throw new Error(
        `BookTopic ${requestedContext.topicId} was not found in Note ${requestedContext.noteId}`,
      )
    }
    await selectContext(summary)
  }, [contextsQuery.data, requestedContext, selectContext])

  useEffect(() => {
    if (requestedContext === null
      || requestedContextSelectionStartedRef.current
      || documentQuery.data === undefined
      || contextsQuery.data === undefined) {
      return
    }
    requestedContextSelectionStartedRef.current = true
    void selectRequestedContext().catch(error => setRequestedContextError(error))
  }, [contextsQuery.data, documentQuery.data, requestedContext, selectRequestedContext])

  const rebindContext = useCallback(async (summary: DesktopBookTopicContextSummary) => {
    setCreating(true)
    try {
      const result = await window.desktop.rebindBookContext({
        noteId: summary.noteId,
        readingId,
        topicId: summary.topicId,
      })
      setContextInitialPosition(null)
      setContext(result.context)
      setSessionId(result.sessionId)
      setRebindCandidate(null)
      toast.warning(t('reader.contextRebound'))
    }
    catch (error) {
      toast.error(publicError(error))
    }
    finally {
      setCreating(false)
    }
  }, [readingId, t])

  const toolbarActions = requestedContext === null && context === null && !contextChooserOpen
    ? (
        <button
          {...stylex.props(readerRouteStyles.toolbarActionButton)}
          aria-label={t('reader.addContext')}
          data-window-no-drag=""
          disabled={documentQuery.data === undefined}
          title={t('reader.addContext')}
          type="button"
          onClick={openCreateForm}
        >
          <Plus aria-hidden="true" size={17} strokeWidth={1.9} />
        </button>
      )
    : null
  const titlebar = useMemo(() => ({ navigation: 'hidden' as const }), [])
  usePageTitlebar(titlebar)

  const statusError = requestedContextError ?? documentQuery.error ?? contextsQuery.error
  const resolvingRequestedContext = requestedContext !== null
    && context === null
    && rebindCandidate === null
    && statusError === null
  return (
    <main {...stylex.props(readerRouteStyles.page, source && readerRouteStyles.pageOpen)}>
      {documentQuery.isPending || (documentQuery.data && contextsQuery.isPending) || resolvingRequestedContext
        ? (
            <section {...stylex.props(readerRouteStyles.routeStatus)} role="status">
              <LoaderCircle {...stylex.props(readerRouteStyles.spinner)} aria-hidden="true" size={24} strokeWidth={1.6} />
              <p {...stylex.props(readerRouteStyles.statusTitle)}>{t('reader.opening')}</p>
            </section>
          )
        : statusError
          ? (
              <section {...stylex.props(readerRouteStyles.routeStatus)} role="alert">
                <AlertCircle {...stylex.props(readerRouteStyles.statusIcon)} aria-hidden="true" size={30} strokeWidth={1.5} />
                <h1 {...stylex.props(readerRouteStyles.statusTitle)}>{t('reader.couldNotOpen')}</h1>
                <p {...stylex.props(readerRouteStyles.statusDetail)}>{publicError(statusError)}</p>
                <Link {...stylex.props(readerRouteStyles.openButton, readerRouteStyles.backLink)} search={{}} to="/shelf">
                  <BookOpen aria-hidden="true" size={15} strokeWidth={1.8} />
                  {t('reader.shelf')}
                </Link>
              </section>
            )
          : source && documentQuery.data
            ? (
                <>
                  {context && sessionId
                    ? (
                        <BoundShelfReader
                          key={`${context.note.id}:${context.topicId}:${sessionId}`}
                          configuration={configuration}
                          context={context}
                          initialPosition={contextInitialPosition}
                          sessionId={sessionId}
                          source={source}
                        />
                      )
                    : (
                        <WindowReader
                          annotationEditingEnabled={false}
                          arrowKeyPageTurning={configuration.readerArrowKeyPageTurning}
                          initialPresentationMode={configuration.readerEpubPresentationMode}
                          source={source}
                          title={fallbackTitle}
                          toolbarActions={toolbarActions}
                          onPositionChange={(position) => {
                            unboundPositionRef.current = position
                          }}
                        />
                      )}
                  {contextChooserOpen && contextsQuery.data
                    ? (
                        <ContextChoiceDialog
                          bookTitle={fallbackTitle}
                          contexts={contextsQuery.data}
                          creating={creating}
                          onCreate={() => void createContext({ noteTitle: fallbackTitle, topicTitle: fallbackTitle })}
                          onSelect={summary => void selectContext(summary).catch(error => toast.error(publicError(error)))}
                        />
                      )
                    : null}
                  {createOpen
                    ? (
                        <CreateBookDialog
                          creating={creating}
                          draft={createDraft}
                          error={createError}
                          onCancel={() => setCreateOpen(false)}
                          onChange={(field, value) => {
                            setCreateDraft(current => ({ ...current, [field]: value }))
                            setCreateError(null)
                          }}
                          onSubmit={() => void createContext(createDraft)}
                        />
                      )
                    : null}
                  {rebindCandidate
                    ? (
                        <ConfirmRebindDialog
                          creating={creating}
                          onCancel={() => {
                            setRebindCandidate(null)
                            setContextChoiceResolved(false)
                          }}
                          onConfirm={() => void rebindContext(rebindCandidate)}
                        />
                      )
                    : null}
                </>
              )
            : null}
    </main>
  )
}

function ShelfReaderRoute() {
  const { readingId } = shelfReaderRouteApi.useParams()
  const search = shelfReaderRouteApi.useSearch()
  const requestedContext = search.noteId === undefined
    ? null
    : { noteId: search.noteId, topicId: search.topicId }
  const sessionKey = requestedContext === null
    ? readingId
    : `${readingId}:${requestedContext.noteId}:${requestedContext.topicId}`
  return <ShelfReaderSession key={sessionKey} readingId={readingId} requestedContext={requestedContext} />
}

export const Route = createFileRoute('/reader_/$readingId')({
  component: ShelfReaderRoute,
  validateSearch: validateShelfReaderSearch,
})
