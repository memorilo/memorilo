import type { DesktopDocument } from '@memorilo/desktop-preload'
import type { EditorLoroChange, EditorMode } from '@memorilo/editor'
import { demoEditorAdapters, Editor } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { editorRouteStyles } from './-index.stylex'

function EditorRoute() {
  const [mode, setMode] = useState<EditorMode>('document')
  const [document, setDocument] = useState<DesktopDocument | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const pendingChangeRef = useRef<EditorLoroChange | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const documentId = document?.id
  const documentTitle = document?.title

  useEffect(() => {
    let active = true
    void window.desktop.openMostRecentDocument().then(
      (openedDocument) => {
        if (active)
          setDocument(openedDocument)
      },
      (error) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : String(error))
      },
    )
    return () => {
      active = false
    }
  }, [])

  const persist = useCallback((change: EditorLoroChange, reportError: boolean) => {
    if (!documentId || !documentTitle)
      throw new Error('Cannot save an editor change before opening a document')
    void window.desktop.saveDocument({
      id: documentId,
      nodes: change.nodes,
      snapshot: change.snapshot,
      title: documentTitle,
    }).then(
      (savedDocument) => {
        if (reportError) {
          setDocument(current => current ? { ...current, updatedAt: savedDocument.updatedAt } : current)
          setSaveError(null)
        }
      },
      (error) => {
        if (reportError)
          setSaveError(error instanceof Error ? error.message : String(error))
        else
          console.error('Failed to flush the current document', error)
      },
    )
  }, [documentId, documentTitle])

  const handleLoroChange = useCallback((change: EditorLoroChange) => {
    pendingChangeRef.current = change
    if (saveTimerRef.current !== null)
      clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      const pendingChange = pendingChangeRef.current
      if (!pendingChange)
        throw new Error('The document save timer fired without a pending change')
      pendingChangeRef.current = null
      persist(pendingChange, true)
    }, 250)
  }, [persist])

  useEffect(() => () => {
    if (saveTimerRef.current !== null)
      clearTimeout(saveTimerRef.current)
    const pendingChange = pendingChangeRef.current
    if (pendingChange)
      persist(pendingChange, false)
  }, [persist])

  if (loadError) {
    return (
      <main {...stylex.props(editorRouteStyles.page)} role="alert">
        Failed to open document:
        {loadError}
      </main>
    )
  }
  if (!document)
    return <main {...stylex.props(editorRouteStyles.page)} role="status">Opening document…</main>

  return (
    <main {...stylex.props(editorRouteStyles.page)}>
      <div {...stylex.props(editorRouteStyles.toolbar)}>
        <div {...stylex.props(editorRouteStyles.modeGroup)} aria-label="Editor mode" role="group">
          <button
            {...stylex.props(editorRouteStyles.modeButton, mode === 'document' && editorRouteStyles.modeButtonSelected)}
            aria-label="Document mode"
            aria-pressed={mode === 'document'}
            type="button"
            onClick={() => setMode('document')}
          >
            Document
          </button>
          <button
            {...stylex.props(editorRouteStyles.modeButton, mode === 'outline' && editorRouteStyles.modeButtonSelected)}
            aria-label="Outline mode"
            aria-pressed={mode === 'outline'}
            type="button"
            onClick={() => setMode('outline')}
          >
            Outline
          </button>
        </div>
      </div>
      {saveError
        ? (
            <div aria-live="polite" role="status">
              Failed to save document:
              {saveError}
            </div>
          )
        : null}
      <Editor
        adapters={demoEditorAdapters}
        loro={{ onChange: handleLoroChange, snapshot: document.snapshot }}
        mode={mode}
      />
    </main>
  )
}

export const Route = createFileRoute('/')({ component: EditorRoute })
