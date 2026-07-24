import { demoEditorAdapters, Editor } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'

import { appStyles } from '../styles/app.stylex'

function EditorRoute() {
  return (
    <main {...stylex.props(appStyles.editorPage)}>
      <Editor adapters={demoEditorAdapters} />
    </main>
  )
}

export const Route = createFileRoute('/')({ component: EditorRoute })
