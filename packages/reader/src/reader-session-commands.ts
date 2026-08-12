import type { ReaderAdapterKeyboardEvent, ReaderAdapterSelection } from './internal/reader-adapter'
import type { ReaderSelection } from './types'
import { useCallback, useEffect } from 'react'

interface ReaderSessionCommandsOptions {
  annotationEditingEnabled: boolean
  clearSelection: () => void
  handleReaderKeyboardEvent: (event: ReaderAdapterKeyboardEvent) => boolean
  onCreateHighlight: (selection: ReaderSelection | undefined) => boolean
  onCreateNote: (selection: ReaderSelection | undefined) => boolean
  regionSelectionActive: boolean
  reportError: (error: unknown) => void
  selection: ReaderAdapterSelection | null
  setRegionSelectionEnabled: (enabled: boolean) => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
}

export function useReaderSessionCommands({
  annotationEditingEnabled,
  clearSelection,
  handleReaderKeyboardEvent,
  onCreateHighlight,
  onCreateNote,
  regionSelectionActive,
  reportError,
  selection,
  setRegionSelectionEnabled,
}: ReaderSessionCommandsOptions) {
  const dismissSelection = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  const copySelection = useCallback(() => {
    if (!selection || selection.selection.type !== 'text')
      return
    void navigator.clipboard.writeText(selection.selection.text).then(dismissSelection, reportError)
  }, [dismissSelection, reportError, selection])

  const createHighlight = useCallback(() => {
    if (onCreateHighlight(selection?.selection))
      dismissSelection()
  }, [dismissSelection, onCreateHighlight, selection])

  const createNote = useCallback(() => {
    if (onCreateNote(selection?.selection))
      dismissSelection()
  }, [dismissSelection, onCreateNote, selection])

  const toggleRegionSelection = useCallback(() => {
    if (!annotationEditingEnabled)
      return
    const next = !regionSelectionActive
    if (next)
      dismissSelection()
    setRegionSelectionEnabled(next)
  }, [annotationEditingEnabled, dismissSelection, regionSelectionActive, setRegionSelectionEnabled])

  const handleKeyDown = useCallback((event: globalThis.KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (regionSelectionActive) {
        event.preventDefault()
        setRegionSelectionEnabled(false)
      }
      else if (selection) {
        event.preventDefault()
        dismissSelection()
      }
      return
    }
    if (isTypingTarget(event.target) || event.target instanceof HTMLButtonElement)
      return
    if (handleReaderKeyboardEvent({
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      key: event.key,
      metaKey: event.metaKey,
      repeat: event.repeat,
      shiftKey: event.shiftKey,
    })) {
      event.preventDefault()
    }
  }, [dismissSelection, handleReaderKeyboardEvent, regionSelectionActive, selection, setRegionSelectionEnabled])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return {
    copySelection,
    createHighlight,
    createNote,
    dismissSelection,
    toggleRegionSelection,
  }
}
