import type { ReactNode } from 'react'
import type { EditorModeValue } from '../common/editor-mode'
import type { EditorSession } from '../common/editor-session'
import { EditorCanvas } from '../common/editor-canvas'
import './document-content.stylex'

export function DocumentEditor({
  children,
  focusBlockId,
  mode,
  session,
}: {
  children?: ReactNode
  focusBlockId?: string
  mode: EditorModeValue
  session: EditorSession
}) {
  return <EditorCanvas focusBlockId={focusBlockId} mode={mode} modeControls={children} session={session} />
}
