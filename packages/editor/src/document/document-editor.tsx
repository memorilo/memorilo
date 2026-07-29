import type { ReactNode } from 'react'
import type { EditorModeValue } from '../common/editor-mode'
import type { EditorSession } from '../common/editor-session'
import { EditorCanvas } from '../common/editor-canvas'
import './document-content.stylex'

export function DocumentEditor({
  children,
  mode,
  session,
}: {
  children?: ReactNode
  mode: EditorModeValue
  session: EditorSession
}) {
  return <EditorCanvas mode={mode} modeControls={children} session={session} />
}
