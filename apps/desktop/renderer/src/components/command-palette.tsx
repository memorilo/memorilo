import type { CreateDesktopNoteInput, DesktopNote, DesktopNoteSearchHit } from '@memorilo/desktop-preload'
import type { Cause } from 'effect'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
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

import { router } from '../router'
import { commandPaletteStyles } from './command-palette.stylex'

type CommandSection = 'History' | 'Navigation' | 'Window'
type ResultAccent = 'blue' | 'graphite' | 'violet'

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

interface PaletteCommand extends PaletteResult {
  keywords: readonly string[]
  section: CommandSection
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

function searchMatchLabel(hit: DesktopNoteSearchHit): string {
  switch (hit.match) {
    case 'title':
      return hit.kind === 'note' ? 'Note title' : 'Topic title'
    case 'node-start':
      return 'Node starts with query'
    case 'content':
      return 'Content match'
    case 'semantic':
      return 'Related meaning'
  }
}

function searchResultDescription(hit: DesktopNoteSearchHit): string {
  const match = searchMatchLabel(hit)
  if (hit.kind === 'note')
    return match
  if (hit.match === 'title')
    return `${match} · ${hit.noteTitle}`
  return `${match} · ${hit.preview} · ${hit.noteTitle}`
}

function toPaletteSearchResult(hit: DesktopNoteSearchHit): PaletteResult {
  if (hit.kind === 'note') {
    return {
      accent: 'blue',
      action: 'Open',
      description: searchResultDescription(hit),
      icon: FileText,
      id: `note:${hit.noteId}`,
      label: hit.noteTitle,
      run: () => void openNote(hit.noteId),
    }
  }

  const search = hit.blockId === null ? {} : { focus: hit.blockId }
  return {
    accent: 'violet',
    action: 'Open',
    description: searchResultDescription(hit),
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
  onToggleSidebar,
  sidebarVisible,
}: {
  onToggleSidebar: () => void
  sidebarVisible: boolean
}) {
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
        action: 'Open',
        description: 'Open the editor',
        icon: CalendarDays,
        id: 'open-journals',
        keywords: ['journal', 'editor', 'write', 'note'],
        label: 'Open Journals',
        run: () => void router.navigate({ to: '/journals' }),
        section: 'Navigation',
      },
      {
        accent: 'violet',
        action: 'Open',
        description: 'Browse every Note',
        icon: Files,
        id: 'open-pages',
        keywords: ['pages', 'library', 'table', 'notes'],
        label: 'Open Pages',
        run: () => void router.navigate({ to: '/pages' }),
        section: 'Navigation',
      },
    ]
    const history: PaletteCommand[] = []
    if (historyPosition.index > 0) {
      history.push({
        accent: 'graphite',
        action: 'Go',
        description: 'Return to the previous page',
        icon: ArrowLeft,
        id: 'go-back',
        keywords: ['back', 'previous', 'history'],
        label: 'Go Back',
        run: () => router.history.back(),
        section: 'History',
      })
    }
    if (historyPosition.index < historyPosition.maxIndex) {
      history.push({
        accent: 'graphite',
        action: 'Go',
        description: 'Move to the next page',
        icon: ArrowRight,
        id: 'go-forward',
        keywords: ['forward', 'next', 'history'],
        label: 'Go Forward',
        run: () => router.history.forward(),
        section: 'History',
      })
    }
    return [
      ...navigation,
      ...history,
      {
        accent: 'graphite',
        action: 'Toggle',
        description: sidebarVisible ? 'Hide workspace navigation' : 'Show workspace navigation',
        icon: PanelLeft,
        id: 'toggle-sidebar',
        keywords: ['sidebar', 'navigation', 'panel', 'toggle', 'hide', 'show'],
        label: 'Toggle Sidebar',
        run: onToggleSidebar,
        section: 'Window',
      },
    ]
  }, [historyPosition.index, historyPosition.maxIndex, onToggleSidebar, sidebarVisible])

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
      ? (noteSearch.data ?? []).map(toPaletteSearchResult)
      : [],
    [deferredQuery, normalizedQuery, noteSearch.data],
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
        action: 'Create',
        deferClose: true,
        description: 'Use this text as the Note title and first H1 heading',
        disabled: createNotePending,
        icon: FilePlus2,
        id: 'create-note',
        label: `Create Note “${trimmedQuery}”`,
        run: () => mutateCreateNote({ initialHeading: trimmedQuery, title: trimmedQuery }),
      }
    : null, [canCreateNote, createNotePending, mutateCreateNote, trimmedQuery])
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
        Couldn’t create Note
      </div>
    )
  }
  else if (searchPending && visibleResults.length === 0) {
    resultStatus = (
      <div {...stylex.props(commandPaletteStyles.searchStatus)} role="status">
        Searching Notes…
      </div>
    )
  }
  else if (searchFailed) {
    resultStatus = (
      <div {...stylex.props(commandPaletteStyles.searchStatus, commandPaletteStyles.searchStatusError)} role="alert">
        Couldn’t search Notes
      </div>
    )
  }
  else if (visibleResults.length === 0) {
    resultStatus = (
      <div {...stylex.props(commandPaletteStyles.searchStatus)} role="status">
        No matching commands or Notes
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
                aria-label="Search Memorilo"
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
                <h2 {...stylex.props(commandPaletteStyles.visuallyHidden)}>Search Memorilo</h2>
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
                      aria-label="Search commands and Notes"
                      autoComplete="off"
                      placeholder="Search Memorilo"
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
                    ? <LoaderCircle {...stylex.props(commandPaletteStyles.searchSpinner)} aria-label="Creating Note" />
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
                        ? <LoaderCircle {...stylex.props(commandPaletteStyles.searchSpinner)} aria-label="Searching Notes" />
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
                            aria-label="Commands and Notes"
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
                                      onMouseEnter={() => setSelectedId(result.id)}
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
