import { demoEditorAdapters, Editor } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'

import { appStyles } from '../styles/app.stylex'

function EditorRoute() {
  return (
    <section {...stylex.props(appStyles.page, appStyles.editorPage)}>
      <header {...stylex.props(appStyles.pageHeader, appStyles.pageHeaderCompact)}>
        <p {...stylex.props(appStyles.eyebrow)}>Workspace</p>
        <h1 {...stylex.props(appStyles.pageTitle)}>Editor</h1>
      </header>
      <Editor adapters={demoEditorAdapters} />
    </section>
  )
}

export const Route = createFileRoute('/editor')({ component: EditorRoute })
