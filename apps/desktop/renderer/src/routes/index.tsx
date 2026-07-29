import type { DesktopNote } from '@memorilo/desktop-preload'
import type {
  EditorNote,
  EditorNoteChange,
  EditorTopicDocument,
} from '@memorilo/editor'
import { createEditorNote, demoEditorAdapters, Editor, EditorMode } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { editorRouteStyles } from './-index.stylex'

const saveDelay = 250

interface OpenEditorNote {
  note: EditorNote
  stored: DesktopNote
  topic: EditorTopicDocument
}

function OpenedTopicEditor({ opened, saveError }: { opened: OpenEditorNote, saveError: string | null }) {
  const mode = useSyncExternalStore(opened.topic.subscribe, opened.topic.getMode, opened.topic.getMode)

  return (
    <main {...stylex.props(editorRouteStyles.page)}>
      <div {...stylex.props(editorRouteStyles.toolbar)}>
        <div {...stylex.props(editorRouteStyles.modeGroup)} aria-label="Editor mode" role="group">
          <button
            {...stylex.props(editorRouteStyles.modeButton, mode === EditorMode.Document && editorRouteStyles.modeButtonSelected)}
            aria-label="Document mode"
            aria-pressed={mode === EditorMode.Document}
            type="button"
            onClick={() => opened.topic.setMode(EditorMode.Document)}
          >
            Document
          </button>
          <button
            {...stylex.props(editorRouteStyles.modeButton, mode === EditorMode.Outline && editorRouteStyles.modeButtonSelected)}
            aria-label="Outline mode"
            aria-pressed={mode === EditorMode.Outline}
            type="button"
            onClick={() => opened.topic.setMode(EditorMode.Outline)}
          >
            Outline
          </button>
        </div>
      </div>
      {saveError
        ? (
            <div aria-live="polite" role="status">
              Failed to save Note:
              {saveError}
            </div>
          )
        : null}
      <Editor
        adapters={demoEditorAdapters}
        topic={opened.topic}
      />
    </main>
  )
}

function EditorRoute() {
  const [opened, setOpened] = useState<OpenEditorNote | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const noteRef = useRef<EditorNote | null>(null)
  const pendingChangesRef = useRef<EditorNoteChange[]>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistingRef = useRef(false)
  const flushPendingRef = useRef<(reportError: boolean) => void>(() => undefined)

  const flushPending = useCallback((reportError: boolean) => {
    const note = noteRef.current
    if (!note || persistingRef.current || pendingChangesRef.current.length === 0)
      return
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const changes = pendingChangesRef.current.splice(0)
    persistingRef.current = true

    void (async () => {
      try {
        const receipt = await window.desktop.saveNoteUpdates({
          noteId: note.id,
          updates: changes.map(change => change.update),
        })
        setOpened(current => current
          ? {
              ...current,
              stored: {
                ...current.stored,
                updatedAt: receipt.updatedAt,
              },
            }
          : current)
        if (reportError)
          setSaveError(null)
      }
      catch (error) {
        pendingChangesRef.current.unshift(...changes)
        if (reportError)
          setSaveError(error instanceof Error ? error.message : String(error))
        else
          console.error('Failed to flush the current Note', error)
      }
      finally {
        persistingRef.current = false
        if (pendingChangesRef.current.length > 0 && saveTimerRef.current === null) {
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            flushPendingRef.current(true)
          }, saveDelay)
        }
      }
    })()
  }, [])
  flushPendingRef.current = flushPending

  const handleNoteChange = useCallback((change: EditorNoteChange) => {
    pendingChangesRef.current.push(change)
    if (saveTimerRef.current !== null)
      clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      flushPendingRef.current(true)
    }, saveDelay)
  }, [])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined

    void window.desktop.openMostRecentNote().then(async (stored) => {
      if (!active)
        return
      const note = createEditorNote({
        id: stored.id,
        snapshot: stored.snapshot,
        title: stored.title,
      })
      if (!active)
        return

      noteRef.current = note
      unsubscribe = note.subscribe(handleNoteChange)
      const existingTopic = note.getEntries().find(entry => entry.kind === 'topic')
      const topicId = existingTopic?.id ?? note.createTopic({ mode: EditorMode.Document, title: 'Untitled Topic' })
      setOpened({
        note,
        stored,
        topic: note.bindTopic(topicId),
      })
    }, (error) => {
      if (active)
        setLoadError(error instanceof Error ? error.message : String(error))
    }).catch((error) => {
      if (active)
        setLoadError(error instanceof Error ? error.message : String(error))
    })

    return () => {
      active = false
      unsubscribe?.()
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      flushPendingRef.current(false)
    }
  }, [handleNoteChange])

  if (loadError) {
    return (
      <main {...stylex.props(editorRouteStyles.page)} role="alert">
        Failed to open Note:
        {loadError}
      </main>
    )
  }
  if (!opened)
    return <main {...stylex.props(editorRouteStyles.page)} role="status">Opening Note…</main>

  return <OpenedTopicEditor opened={opened} saveError={saveError} />
}

export const Route = createFileRoute('/')({ component: EditorRoute })
