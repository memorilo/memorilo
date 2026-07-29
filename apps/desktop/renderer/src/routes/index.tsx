import type { EditorMode } from '@memorilo/editor'
import { demoEditorAdapters, Editor } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { editorRouteStyles } from './-index.stylex'

function EditorRoute() {
  const [mode, setMode] = useState<EditorMode>('document')

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
      <Editor adapters={demoEditorAdapters} mode={mode} />
    </main>
  )
}

export const Route = createFileRoute('/')({ component: EditorRoute })
