import type { ReactNode } from 'react'
import type { PaletteCommand } from '../../shared/command-palette'
import type { PaletteResult } from './command-palette-search-model'
import { Dialog, Status } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { LoaderCircle, Search } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react'

import { useTranslation } from 'react-i18next'
import { useOperationSupervisor } from '../../shared/lifecycle/owned-resource'
import { initialCommandPaletteState, reduceCommandPaletteState } from './command-palette-state'
import { commandPaletteStyles } from './command-palette.stylex'
import { useCommandPaletteCommands } from './use-command-palette-commands'
import { useCommandPaletteSearch } from './use-command-palette-search'

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
  const [panelHeight, setPanelHeight] = useState(58)
  const [state, dispatch] = useReducer(reduceCommandPaletteState, initialCommandPaletteState)
  const { action, open, query, selectedId, sessionId } = state
  const actionPending = action === 'pending'
  const actionFailed = action === 'failed'
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const shouldReduceMotion = useReducedMotion()
  const actions = useOperationSupervisor('Command palette actions')
  const commands = useCommandPaletteCommands({
    contextualCommands,
    onToggleSidebar,
    sidebarVisible,
    t,
  })
  const {
    createNoteFailed,
    hasQuery,
    resetCreateNote,
    results: visibleResults,
    searchFailed,
    searchPending,
    selected: selectedResult,
  } = useCommandPaletteSearch({
    actionPending,
    commands,
    open,
    query,
    selectedId,
    t,
  })

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
    resetCreateNote()
    dispatch({ type: 'open' })
  }, [resetCreateNote])

  const closePalette = useCallback(() => {
    dispatch({ type: 'close' })
  }, [])

  const restoreFocus = useCallback(() => {
    const previousFocus = previousFocusRef.current
    previousFocusRef.current = null
    if (previousFocus?.isConnected)
      previousFocus.focus()
  }, [])

  const executeResult = useCallback(async (result: PaletteResult) => {
    if (result.disabled)
      return
    const actionSessionId = sessionId
    dispatch({ type: 'actionStarted' })
    try {
      const outcome = await actions.runSingleFlight(async () => result.run())
      if (outcome.status === 'accepted')
        dispatch({ sessionId: actionSessionId, type: 'actionSucceeded' })
    }
    catch {
      dispatch({ sessionId: actionSessionId, type: 'actionFailed' })
    }
  }, [actions, sessionId])

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
    dispatch({ selectedId: result.id, type: 'selectionChanged' })
  }, [selectedResult, visibleResults])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.dataset.shortcutInput !== undefined)
        return
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
          void executeResult(selectedResult)
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
      <Status variant="error" xstyle={[commandPaletteStyles.searchStatus, commandPaletteStyles.searchStatusError]}>{t('couldNotCreateNote')}</Status>
    )
  }
  else if (actionFailed) {
    resultStatus = (
      <Status variant="error" xstyle={[commandPaletteStyles.searchStatus, commandPaletteStyles.searchStatusError]}>{t('couldNotRunCommand')}</Status>
    )
  }
  else if (searchPending && visibleResults.length === 0) {
    resultStatus = (
      <Status xstyle={commandPaletteStyles.searchStatus}>{t('searchingNotes')}</Status>
    )
  }
  else if (searchFailed) {
    resultStatus = (
      <Status variant="error" xstyle={[commandPaletteStyles.searchStatus, commandPaletteStyles.searchStatusError]}>{t('couldNotSearchNotes')}</Status>
    )
  }
  else if (visibleResults.length === 0) {
    resultStatus = (
      <Status xstyle={commandPaletteStyles.searchStatus}>{t('noMatches')}</Status>
    )
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen)
          closePalette()
      }}
    >
      <Dialog.Portal forceMount>
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
                  <Dialog.Content
                    aria-label={t('searchDialogLabel')}
                    asChild
                    forceMount
                    position="custom"
                    variant="command"
                    xstyle={commandPaletteStyles.panel}
                  >
                    <motion.section
                      animate={{ height: panelHeight, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      initial={{ height: 58, opacity: 0 }}
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
                            aria-busy={actionPending}
                            aria-controls={hasQuery ? listboxId : undefined}
                            aria-expanded={hasQuery}
                            aria-label={t('searchLabel')}
                            autoComplete="off"
                            placeholder={t('searchPlaceholder')}
                            readOnly={actionPending}
                            role="combobox"
                            spellCheck={false}
                            value={query}
                            onChange={(event) => {
                              dispatch({ query: event.target.value, type: 'queryChanged' })
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
                        {actionPending
                          ? <LoaderCircle {...stylex.props(commandPaletteStyles.searchSpinner)} aria-label={t('runningCommand')} />
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
                                            onClick={() => void executeResult(result)}
                                            onPointerMove={() => dispatch({
                                              selectedId: result.id,
                                              type: 'selectionChanged',
                                            })}
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
                  </Dialog.Content>
                </motion.div>
              )
            : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
