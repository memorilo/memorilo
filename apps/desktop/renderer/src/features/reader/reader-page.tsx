import type { DesktopBookTopicContextSummary, DesktopBookTopicReadingContext } from '@memorilo/desktop-api'
import type { ReaderPosition, ReaderSource } from '@memorilo/editor/reader'
import type { BookTitleDraft } from './reader-context-dialogs'
import { WindowReader } from '@memorilo/editor/reader'
import { Button } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertCircle, BookOpen, LoaderCircle, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify/unstyled'
import { useDesktopConfiguration } from '../../shared/configuration'

import { desktopRequests } from '../../shared/desktop-requests'
import { useOwnedResource } from '../../shared/lifecycle/owned-resource'
import { usePageTitlebar } from '../../shared/page-titlebar'
import { useFlushNotePersistence } from '../notes/persistence/note-persistence-hooks'
import { desktopEffect, shelfEffectQuery } from '../shelf/shelf-query'
import { BoundShelfReader } from './bound-shelf-reader'
import {
  ConfirmRebindDialog,
  ContextChoiceDialog,
  CreateBookDialog,
  DuplicateTitleToast,
} from './reader-context-dialogs'
import { readerPageStyles } from './reader-page.stylex'
import { createReaderContextSession } from './session/reader-context-session'

interface RequestedBookContext {
  annotationId?: string
  noteId: string
  topicId: string
}

export type ShelfReaderSearch
  = | RequestedBookContext
    | { noteId?: undefined, topicId?: undefined }

function publicError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  const flush = useFlushNotePersistence()
  const navigate = useNavigate()
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
  const commandGenerationRef = useRef(0)
  const unboundPositionRef = useRef<ReaderPosition | null>(null)

  const documentQuery = useQuery(shelfEffectQuery.queryOptions({
    gcTime: 0,
    queryFn: () => desktopEffect('shelf.open-reading', () => desktopRequests.openShelfReading({ readingId })),
    queryKey: ['shelf-reading', readingId],
    retry: false,
    staleTime: Infinity,
  }))
  const contextsQuery = useQuery(shelfEffectQuery.queryOptions({
    enabled: documentQuery.data !== undefined,
    gcTime: 0,
    queryFn: () => desktopEffect('books.list-contexts', () => desktopRequests.listBookContexts(readingId)),
    queryKey: ['shelf-reading-contexts', readingId],
    retry: false,
    staleTime: Infinity,
  }))
  const source = useMemo<ReaderSource | null>(() => documentQuery.data
    ? {
        byteLength: documentQuery.data.byteLength,
        format: documentQuery.data.format,
        name: documentQuery.data.name,
        read: (offset, length) => desktopRequests.readShelfReadingRange({ length, offset, readingId }),
      }
    : null, [documentQuery.data, readingId])
  const contextSessionKey = useMemo(() => documentQuery.data
    ? { currentFile: documentQuery.data.book.file, flush, readingId, transport: desktopRequests }
    : null, [documentQuery.data, flush, readingId])
  const contextSession = useOwnedResource(
    'Reader context session',
    contextSessionKey,
    current => createReaderContextSession({
      ...current,
      onCleanupError: error => console.error('Failed to clean up reader session', error),
    }),
    error => console.error('Failed to clean up reader session', error),
  )
  const fallbackTitle = documentQuery.data?.book.book.title ?? documentQuery.data?.name ?? t('reader.document')
  const contextChooserOpen = requestedContext === null
    && (contextsQuery.data?.length ?? 0) > 0
    && !contextChoiceResolved
  const openContextTopic = useCallback(async (topicId: string) => {
    if (!context)
      throw new Error('Cannot open a Topic without a bound Reader context')
    await flush()
    await navigate({
      params: { noteId: context.note.id, topicId },
      search: {},
      to: '/note/$noteId/$topicId',
    })
  }, [context, flush, navigate])

  const openCreateForm = useCallback(() => {
    const title = documentQuery.data?.book.book.title ?? documentQuery.data?.name ?? ''
    setCreateDraft({ noteTitle: title, topicTitle: title })
    setCreateError(null)
    setCreateOpen(true)
  }, [documentQuery.data])

  const beginContextCommand = useCallback(() => {
    const generation = commandGenerationRef.current + 1
    commandGenerationRef.current = generation
    setCreating(true)
    return () => {
      if (commandGenerationRef.current === generation)
        setCreating(false)
    }
  }, [])

  const createContext = useCallback(async (draft: BookTitleDraft) => {
    if (!contextSession)
      throw new Error('The book document is not ready')
    const finish = beginContextCommand()
    setCreateError(null)
    try {
      const outcome = await contextSession.execute({
        kind: 'create',
        noteTitle: draft.noteTitle,
        topicTitle: draft.topicTitle,
      })
      if (outcome.status === 'superseded')
        return
      if (outcome.status === 'invalid-titles') {
        setCreateError(t('reader.titlesRequired'))
        setCreateOpen(true)
        return
      }
      if (outcome.status === 'duplicate-title') {
        setContextChoiceResolved(true)
        setCreateOpen(false)
        setCreateDraft({ noteTitle: outcome.noteTitle, topicTitle: outcome.topicTitle })
        toast.error(
          <DuplicateTitleToast onEdit={() => setCreateOpen(true)} t={t} />,
          { autoClose: false },
        )
        return
      }
      if (outcome.status !== 'connected')
        throw new Error(`Unexpected create context outcome: ${outcome.status}`)
      setContextInitialPosition(unboundPositionRef.current)
      setContext(outcome.context)
      setSessionId(outcome.sessionId)
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
      finish()
    }
  }, [beginContextCommand, contextSession, t])

  const selectContext = useCallback(async (summary: DesktopBookTopicContextSummary) => {
    if (!contextSession)
      throw new Error('The book document is not ready')
    const finish = beginContextCommand()
    try {
      const outcome = await contextSession.execute({ context: summary, kind: 'select' })
      if (outcome.status === 'superseded')
        return
      if (outcome.status === 'format-mismatch')
        throw new Error(t('reader.cannotChangeFormat'))
      if (outcome.status === 'requires-rebind') {
        setContextChoiceResolved(true)
        setRebindCandidate(outcome.context)
        return
      }
      if (outcome.status !== 'connected')
        throw new Error(`Unexpected select context outcome: ${outcome.status}`)
      setContextInitialPosition(null)
      setContext(outcome.context)
      setSessionId(outcome.sessionId)
      setContextChoiceResolved(true)
    }
    finally {
      finish()
    }
  }, [beginContextCommand, contextSession, t])

  const selectRequestedContext = useCallback(async () => {
    if (requestedContext === null || contextsQuery.data === undefined)
      throw new Error('The requested BookTopic context is not ready')
    setRequestedContextError(null)
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
      || context !== null
      || documentQuery.data === undefined
      || contextsQuery.data === undefined) {
      return
    }
    let active = true
    void selectRequestedContext().catch((error) => {
      if (active)
        setRequestedContextError(error)
    })
    return () => {
      active = false
    }
  }, [context, contextsQuery.data, documentQuery.data, requestedContext, selectRequestedContext])

  const rebindContext = useCallback(async (summary: DesktopBookTopicContextSummary) => {
    if (!contextSession)
      throw new Error('The book document is not ready')
    const finish = beginContextCommand()
    try {
      const outcome = await contextSession.execute({ context: summary, kind: 'rebind' })
      if (outcome.status === 'superseded')
        return
      if (outcome.status === 'format-mismatch')
        throw new Error(t('reader.cannotChangeFormat'))
      if (outcome.status !== 'connected')
        throw new Error(`Unexpected rebind context outcome: ${outcome.status}`)
      setContextInitialPosition(null)
      setContext(outcome.context)
      setSessionId(outcome.sessionId)
      setRebindCandidate(null)
      toast.warning(t('reader.contextRebound'))
    }
    catch (error) {
      toast.error(publicError(error))
    }
    finally {
      finish()
    }
  }, [beginContextCommand, contextSession, t])

  const toolbarActions = requestedContext === null && context === null && !contextChooserOpen
    ? (
        <Button
          aria-label={t('reader.addContext')}
          data-window-no-drag=""
          disabled={documentQuery.data === undefined}
          title={t('reader.addContext')}
          variant="toolbar"
          xstyle={readerPageStyles.toolbarActionButton}
          onClick={openCreateForm}
        >
          <Plus aria-hidden="true" size={17} strokeWidth={1.9} />
        </Button>
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
    <main {...stylex.props(readerPageStyles.page, source && readerPageStyles.pageOpen)}>
      {documentQuery.isPending || (documentQuery.data && contextsQuery.isPending) || resolvingRequestedContext
        ? (
            <section {...stylex.props(readerPageStyles.routeStatus)} role="status">
              <LoaderCircle {...stylex.props(readerPageStyles.spinner)} aria-hidden="true" size={24} strokeWidth={1.6} />
              <p {...stylex.props(readerPageStyles.statusTitle)}>{t('reader.opening')}</p>
            </section>
          )
        : statusError
          ? (
              <section {...stylex.props(readerPageStyles.routeStatus)} role="alert">
                <AlertCircle {...stylex.props(readerPageStyles.statusIcon)} aria-hidden="true" size={30} strokeWidth={1.5} />
                <h1 {...stylex.props(readerPageStyles.statusTitle)}>{t('reader.couldNotOpen')}</h1>
                <p {...stylex.props(readerPageStyles.statusDetail)}>{publicError(statusError)}</p>
                <Link {...stylex.props(readerPageStyles.openButton, readerPageStyles.backLink)} search={{}} to="/shelf">
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
                          context={context}
                          initialAnnotationId={requestedContext?.annotationId}
                          initialPosition={contextInitialPosition}
                          onOpenTopic={openContextTopic}
                          source={source}
                        />
                      )
                    : (
                        <WindowReader
                          annotationEditingEnabled={false}
                          arrowKeyPageTurning={configuration.readerArrowKeyPageTurning}
                          initialPresentationMode={configuration.readerEpubPresentationMode}
                          pageMode={configuration.readerPageMode}
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

export function ReaderPage({
  readingId,
  search,
}: {
  readingId: string
  search: ShelfReaderSearch
}) {
  const requestedContext = search.noteId === undefined
    ? null
    : {
        ...(search.annotationId === undefined ? {} : { annotationId: search.annotationId }),
        noteId: search.noteId,
        topicId: search.topicId,
      }
  const sessionKey = requestedContext === null
    ? readingId
    : `${readingId}:${requestedContext.noteId}:${requestedContext.topicId}:${requestedContext.annotationId ?? ''}`
  return <ShelfReaderSession key={sessionKey} readingId={readingId} requestedContext={requestedContext} />
}
