import type { CreateDesktopNoteInput, DesktopNote, DesktopNoteSearchHit } from '@memorilo/desktop-preload'
import type { Cause } from 'effect'
import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PaletteCommand, ResultAccent } from './command-palette-context'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  FilePlus2,
  Files,
  FileText,
  ListTree,
  LoaderCircle,
  PanelLeft,
  Search,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useTranslation } from 'react-i18next'
import { router } from '../router'
import { formatJournalHeading } from '../routes/-journal-date'
import { commandPaletteStyles } from './command-palette.stylex'

interface PaletteResult {
  accent: ResultAccent
  action: string
  deferClose?: boolean
  description: string
  disabled?: boolean
  icon: LucideIcon
  id: string
  label: string
  run: () => void
}

interface HistoryPosition {
  index: number
  maxIndex: number
}

const effectQuery = createEffectQuery(Layer.empty)
const searchLimit = 20

function noteSearchQueryOptions(query: string, enabled: boolean) {
  return effectQuery.queryOptions<readonly DesktopNoteSearchHit[], Cause.UnknownError, never>({
    enabled,
    queryFn: () => Effect.tryPromise(() => window.desktop.searchNotes({ limit: searchLimit, query })),
    queryKey: ['memorilo-search', query] as const,
    staleTime: 15_000,
  })
}

function createNoteMutationOptions() {
  return effectQuery.mutationOptions<DesktopNote, Cause.UnknownError, never, CreateDesktopNoteInput>({
    mutationFn: input => Effect.tryPromise(() => window.desktop.createNote(input)),
  })
}

function historyIndex(): number {
  return router.history.location.state.__TSR_index
}

async function openStoredNote(stored: DesktopNote): Promise<void> {
  if (stored.kind === 'journal') {
    await router.navigate({ search: { date: stored.journalDate }, to: '/journals' })
    return
  }
  const { defaultTopicId } = await import('../routes/-note-navigation')
  await router.navigate({
    params: { noteId: stored.id, topicId: defaultTopicId(stored) },
    to: '/note/$noteId/$topicId',
  })
}

async function openNote(noteId: string): Promise<void> {
  await openStoredNote(await window.desktop.getNote({ noteId }))
}

function matchesQuery(command: PaletteCommand, normalizedQuery: string): boolean {
  return [command.label, command.description, command.section, ...command.keywords]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery))
}

function searchMatchLabel(hit: DesktopNoteSearchHit, t: TFunction): string {
  switch (hit.match) {
    case 'title':
      return hit.kind === 'note' ? t('noteTitleMatch') : t('topicTitleMatch')
    case 'node-start':
      return t('nodeStartsWith')
    case 'content':
      return t('contentMatch')
    case 'semantic':
      return t('relatedMeaning')
  }
}

function searchResultDescription(hit: DesktopNoteSearchHit, t: TFunction): string {
  const match = searchMatchLabel(hit, t)
  const noteTitle = hit.noteKind === 'journal'
    ? formatJournalHeading(hit.journalDate)
    : hit.noteTitle
  if (hit.kind === 'note')
    return match
  if (hit.match === 'title')
    return `${match} · ${noteTitle}`
  return `${match} · ${hit.preview} · ${noteTitle}`
}

function toPaletteSearchResult(hit: DesktopNoteSearchHit, t: TFunction): PaletteResult {
  if (hit.noteKind === 'journal') {
    return {
      accent: 'blue',
      action: t('open'),
      description: searchResultDescription(hit, t),
      icon: CalendarDays,
      id: `${hit.kind}:${hit.noteId}${hit.kind === 'topic' ? `:${hit.topicId}` : ''}`,
      label: formatJournalHeading(hit.journalDate),
      run: () => void router.navigate({ search: { date: hit.journalDate }, to: '/journals' }),
    }
  }

  if (hit.kind === 'note') {
    return {
      accent: 'blue',
      action: t('open'),
      description: searchResultDescription(hit, t),
      icon: FileText,
      id: `note:${hit.noteId}`,
      label: hit.noteTitle,
      run: () => void openNote(hit.noteId),
    }
  }

  const search = hit.blockId === null ? {} : { focus: hit.blockId }
  return {
    accent: 'violet',
    action: t('open'),
    description: searchResultDescription(hit, t),
    icon: ListTree,
    id: `topic:${hit.noteId}:${hit.topicId}`,
    label: hit.topicTitle,
    run: () => void router.navigate({
      params: { noteId: hit.noteId, topicId: hit.topicId },
      search,
      to: '/note/$noteId/$topicId',
    }),
  }
}

export function CommandPalette({
  contextualCommands,
  onToggleSidebar,
  sidebarVisible,
}: {
  contextualCommands: readonly PaletteCommand[]
  onToggleSidebar: () => void
  sidebarVisible: boolean
}) {
  const { t } = useTranslation('app')
  const [open, setOpen] = useState(false)
  const [panelHeight, setPanelHeight] = useState(58)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [historyPosition, setHistoryPosition] = useState<HistoryPosition>(() => {
    const index = historyIndex()
    return { index, maxIndex: index }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const shouldReduceMotion = useReducedMotion()
  const {
    isError: createNoteFailed,
    isPending: createNotePending,
    mutate: mutateCreateNote,
    reset: resetCreateNote,
  } = useMutation({
    ...createNoteMutationOptions(),
    onSuccess: (note) => {
      setOpen(false)
      void openStoredNote(note)
    },
  })

  useEffect(() => router.history.subscribe(({ action, location }) => {
    const index = location.state.__TSR_index
    setHistoryPosition(current => ({
      index,
      maxIndex: action.type === 'PUSH' ? index : Math.max(current.maxIndex, index),
    }))
  }), [])

  const commands = useMemo<readonly PaletteCommand[]>(() => {
    const navigation: PaletteCommand[] = [
      {
        accent: 'blue',
        action: t('open'),
        description: t('openJournalsDescription'),
        icon: CalendarDays,
        id: 'open-journals',
        keywords: t('openJournalsKeywords') as unknown as readonly string[],
        label: t('openJournals'),
        run: () => void router.navigate({ to: '/journals' }),
        section: t('navigationSection') as PaletteCommand['section'],
      },
      {
        accent: 'violet',
        action: t('open'),
        description: t('openPagesDescription'),
        icon: Files,
        id: 'open-pages',
        keywords: t('openPagesKeywords') as unknown as readonly string[],
        label: t('openPages'),
        run: () => void router.navigate({ to: '/pages' }),
        section: t('navigationSection') as PaletteCommand['section'],
      },
    ]
    const history: PaletteCommand[] = []
    if (historyPosition.index > 0) {
      history.push({
        accent: 'graphite',
        action: t('go'),
        description: t('goBackDescription'),
        icon: ArrowLeft,
        id: 'go-back',
        keywords: t('goBackKeywords') as unknown as readonly string[],
        label: t('goBack'),
        run: () => router.history.back(),
        section: t('historySection') as PaletteCommand['section'],
      })
    }
    if (historyPosition.index < historyPosition.maxIndex) {
      history.push({
        accent: 'graphite',
        action: t('go'),
        description: t('goForwardDescription'),
        icon: ArrowRight,
        id: 'go-forward',
        keywords: t('goForwardKeywords') as unknown as readonly string[],
        label: t('goForward'),
        run: () => router.history.forward(),
        section: t('historySection') as PaletteCommand['section'],
      })
    }
    return [
      ...contextualCommands,
      ...navigation,
      ...history,
      {
        accent: 'graphite',
        action: t('toggle'),
        description: sidebarVisible ? t('toggleSidebarDescription') : t('toggleSidebarDescriptionShow'),
        icon: PanelLeft,
        id: 'toggle-sidebar',
        keywords: t('toggleSidebarKeywords') as unknown as readonly string[],
        label: t('toggleSidebar'),
        run: onToggleSidebar,
        section: t('windowSection') as PaletteCommand['section'],
      },
    ]
  }, [t, contextualCommands, historyPosition.index, historyPosition.maxIndex, onToggleSidebar, sidebarVisible])

  const trimmedQuery = query.trim()
  const normalizedQuery = trimmedQuery.toLocaleLowerCase()
  const hasQuery = normalizedQuery.length > 0
  const deferredQuery = useDeferredValue(normalizedQuery)
  const noteSearch = useQuery(noteSearchQueryOptions(deferredQuery, open && deferredQuery.length > 0))
  const matchingCommands = useMemo(
    () => hasQuery ? commands.filter(command => matchesQuery(command, normalizedQuery)) : [],
    [commands, hasQuery, normalizedQuery],
  )
  const noteResults = useMemo(
    () => deferredQuery === normalizedQuery
      ? (noteSearch.data ?? []).map(hit => toPaletteSearchResult(hit, t))
      : [],
    [deferredQuery, normalizedQuery, noteSearch.data, t],
  )
  const searchPending = hasQuery && (deferredQuery !== normalizedQuery || noteSearch.isPending || noteSearch.isFetching)
  const searchFailed = deferredQuery === normalizedQuery && noteSearch.isError
  const hasLiteralNoteResult = deferredQuery === normalizedQuery
    && noteSearch.data?.some(hit => hit.match !== 'semantic') === true
  const canCreateNote = hasQuery
    && deferredQuery === normalizedQuery
    && !searchPending
    && !searchFailed
    && matchingCommands.length === 0
    && !hasLiteralNoteResult
  const createResult = useMemo<PaletteResult | null>(() => canCreateNote
    ? {
        accent: 'blue',
        action: t('create'),
        deferClose: true,
        description: t('createNoteDescription'),
        disabled: createNotePending,
        icon: FilePlus2,
        id: 'create-note',
        label: t('createNoteLabel', { query: trimmedQuery }),
        run: () => mutateCreateNote({ initialHeading: trimmedQuery, title: trimmedQuery }),
      }
    : null, [canCreateNote, createNotePending, mutateCreateNote, t, trimmedQuery])
  const visibleResults = useMemo<readonly PaletteResult[]>(
    () => [...matchingCommands, ...(createResult ? [createResult] : []), ...noteResults],
    [createResult, matchingCommands, noteResults],
  )
  const selectedMatch = visibleResults.find(result => result.id === selectedId)
  const selectedResult = hasQuery
    ? selectedMatch === undefined ? visibleResults[0] : selectedMatch
    : undefined

  useLayoutEffect(() => {
    if (!hasQuery) {
      setPanelHeight(58)
      return
    }
    const results = resultsRef.current
    if (!results)
      throw new Error('Memorilo search results are missing while the query is active')
    const updatePanelHeight = () => {
      const viewportMaximum = Math.min(560, window.innerHeight - 240)
      setPanelHeight(Math.min(58 + results.scrollHeight, viewportMaximum))
    }
    updatePanelHeight()
    const observer = new ResizeObserver(updatePanelHeight)
    observer.observe(results)
    window.addEventListener('resize', updatePanelHeight)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePanelHeight)
    }
  }, [createNoteFailed, hasQuery, searchFailed, searchPending, visibleResults.length])

  useLayoutEffect(() => {
    if (!open)
      return
    inputRef.current?.focus()
  }, [open])

  const openPalette = useCallback(() => {
    const activeElement = document.activeElement
    previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null
    setQuery('')
    setSelectedId(null)
    resetCreateNote()
    setOpen(true)
  }, [resetCreateNote])

  const closePalette = useCallback(() => {
    setOpen(false)
  }, [])

  const restoreFocus = useCallback(() => {
    const previousFocus = previousFocusRef.current
    previousFocusRef.current = null
    if (previousFocus?.isConnected)
      previousFocus.focus()
  }, [])

  const executeResult = useCallback((result: PaletteResult) => {
    if (result.disabled)
      return
    if (!result.deferClose)
      setOpen(false)
    result.run()
  }, [])

  const moveSelection = useCallback((direction: -1 | 1) => {
    if (visibleResults.length === 0)
      return
    const currentIndex = selectedResult
      ? visibleResults.findIndex(result => result.id === selectedResult.id)
      : -1
    const nextIndex = currentIndex === -1
      ? direction === 1 ? 0 : visibleResults.length - 1
      : (currentIndex + direction + visibleResults.length) % visibleResults.length
    const result = visibleResults[nextIndex]
    if (!result)
      throw new Error(`Memorilo search selection is missing result ${nextIndex}`)
    setSelectedId(result.id)
  }, [selectedResult, visibleResults])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey)
        && !event.altKey
        && !event.shiftKey
        && event.key.toLocaleLowerCase() === 'p') {
        event.preventDefault()
        event.stopPropagation()
        if (event.repeat)
          return
        if (open)
          closePalette()
        else
          openPalette()
        return
      }
      if (!open)
        return
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          moveSelection(1)
          break
        case 'ArrowUp':
          event.preventDefault()
          moveSelection(-1)
          break
        case 'Enter':
          if (!selectedResult)
            return
          event.preventDefault()
          executeResult(selectedResult)
          break
        case 'Escape':
          event.preventDefault()
          closePalette()
          break
        case 'Tab':
          event.preventDefault()
          inputRef.current?.focus()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [closePalette, executeResult, moveSelection, open, openPalette, selectedResult])

  const activeDescendant = selectedResult ? `${listboxId}-${selectedResult.id}` : undefined
  const SelectedIcon = selectedResult?.icon
  const heightTransition = shouldReduceMotion
    ? { duration: 0 }
    : { bounce: 0, type: 'spring', visualDuration: 0.34 } as const
  let resultStatus: ReactNode = null
  if (createNoteFailed) {
    resultStatus = (
      <div {...stylex.props(commandPaletteStyles.searchStatus, commandPaletteStyles.searchStatusError)} role="alert">
        {t('couldNotCreateNote')}
      </div>
    )
  }
  else if (searchPending && visibleResults.length === 0) {
    resultStatus = (
      <div {...stylex.props(commandPaletteStyles.searchStatus)} role="status">
        {t('searchingNotes')}
      </div>
    )
  }
  else if (searchFailed) {
    resultStatus = (
      <div {...stylex.props(commandPaletteStyles.searchStatus, commandPaletteStyles.searchStatusError)} role="alert">
        {t('couldNotSearchNotes')}
      </div>
    )
  }
  else if (visibleResults.length === 0) {
    resultStatus = (
      <div {...stylex.props(commandPaletteStyles.searchStatus)} role="status">
        {t('noMatches')}
      </div>
    )
  }

  return (
    <AnimatePresence initial={false} onExitComplete={restoreFocus}>
      {open
        ? (
            <motion.div
              key="command-palette"
              {...stylex.props(commandPaletteStyles.overlay)}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0.08 : 0.13 }}
              onPointerDown={(event) => {
                if (event.target === event.currentTarget)
                  closePalette()
              }}
            >
              <motion.section
                {...stylex.props(commandPaletteStyles.panel)}
                animate={{ height: panelHeight, opacity: 1 }}
                aria-label={t('searchDialogLabel')}
                aria-modal="true"
                exit={{ opacity: 0 }}
                initial={{ height: 58, opacity: 0 }}
                role="dialog"
                transition={{
                  height: heightTransition,
                  opacity: { duration: shouldReduceMotion ? 0.08 : 0.13 },
                }}
                onPointerDown={event => event.stopPropagation()}
              >
                <h2 {...stylex.props(commandPaletteStyles.visuallyHidden)}>{t('searchDialogLabel')}</h2>
                <div
                  {...stylex.props(
                    commandPaletteStyles.searchRow,
                    hasQuery && commandPaletteStyles.searchRowExpanded,
                  )}
                >
                  <Search {...stylex.props(commandPaletteStyles.searchIcon)} aria-hidden="true" strokeWidth={1.8} />
                  <div {...stylex.props(commandPaletteStyles.searchInputCluster)}>
                    <input
                      ref={inputRef}
                      {...stylex.props(
                        commandPaletteStyles.input,
                        hasQuery && commandPaletteStyles.inputWithQuery,
                      )}
                      aria-activedescendant={activeDescendant}
                      aria-autocomplete="list"
                      aria-busy={createNotePending}
                      aria-controls={hasQuery ? listboxId : undefined}
                      aria-expanded={hasQuery}
                      aria-label={t('searchLabel')}
                      autoComplete="off"
                      placeholder={t('searchPlaceholder')}
                      readOnly={createNotePending}
                      role="combobox"
                      spellCheck={false}
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setSelectedId(null)
                        resetCreateNote()
                      }}
                    />
                    {hasQuery && selectedResult
                      ? (
                          <span {...stylex.props(commandPaletteStyles.searchIntent)} aria-hidden="true">
                            —
                            {' '}
                            {selectedResult.action}
                          </span>
                        )
                      : null}
                  </div>
                  {createNotePending
                    ? <LoaderCircle {...stylex.props(commandPaletteStyles.searchSpinner)} aria-label={t('creatingNote')} />
                    : SelectedIcon
                      ? (
                          <span
                            {...stylex.props(
                              commandPaletteStyles.searchCommandIconFrame,
                              selectedResult.accent === 'blue' && commandPaletteStyles.commandIconBlue,
                              selectedResult.accent === 'violet' && commandPaletteStyles.commandIconViolet,
                              selectedResult.accent === 'graphite' && commandPaletteStyles.commandIconGraphite,
                            )}
                            aria-hidden="true"
                          >
                            <SelectedIcon {...stylex.props(commandPaletteStyles.commandIcon)} strokeWidth={1.8} />
                          </span>
                        )
                      : searchPending
                        ? <LoaderCircle {...stylex.props(commandPaletteStyles.searchSpinner)} aria-label={t('searchingNotes')} />
                        : null}
                </div>

                <div {...stylex.props(commandPaletteStyles.resultsShell)} aria-hidden={!hasQuery}>
                  <AnimatePresence initial={false}>
                    {hasQuery
                      ? (
                          <motion.div
                            ref={resultsRef}
                            id={listboxId}
                            key="search-results"
                            {...stylex.props(commandPaletteStyles.resultsViewport)}
                            animate={{ opacity: 1 }}
                            aria-label={t('commandsAndNotesLabel')}
                            exit={{ opacity: 0 }}
                            initial={{ opacity: 0 }}
                            role="listbox"
                            transition={{ duration: shouldReduceMotion ? 0.08 : 0.14 }}
                          >
                            <ul {...stylex.props(commandPaletteStyles.commandList)} role="none">
                              {visibleResults.map((result) => {
                                const selected = result.id === selectedResult?.id
                                const Icon = result.icon
                                return (
                                  <li key={result.id} role="none">
                                    <button
                                      id={`${listboxId}-${result.id}`}
                                      {...stylex.props(
                                        commandPaletteStyles.command,
                                        selected && commandPaletteStyles.commandSelected,
                                      )}
                                      aria-selected={selected}
                                      disabled={result.disabled}
                                      role="option"
                                      tabIndex={-1}
                                      type="button"
                                      onClick={() => executeResult(result)}
                                      onPointerMove={() => setSelectedId(result.id)}
                                    >
                                      <span
                                        {...stylex.props(
                                          commandPaletteStyles.commandIconFrame,
                                          result.accent === 'blue' && commandPaletteStyles.commandIconBlue,
                                          result.accent === 'violet' && commandPaletteStyles.commandIconViolet,
                                          result.accent === 'graphite' && commandPaletteStyles.commandIconGraphite,
                                        )}
                                      >
                                        <Icon {...stylex.props(commandPaletteStyles.commandIcon)} aria-hidden="true" strokeWidth={1.9} />
                                      </span>
                                      <span {...stylex.props(commandPaletteStyles.commandText)}>
                                        <span {...stylex.props(commandPaletteStyles.commandLabel)}>{result.label}</span>
                                        <span {...stylex.props(commandPaletteStyles.commandDescription)}>{result.description}</span>
                                      </span>
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                            {resultStatus}
                          </motion.div>
                        )
                      : null}
                  </AnimatePresence>
                </div>
              </motion.section>
            </motion.div>
          )
        : null}
    </AnimatePresence>
  )
}
