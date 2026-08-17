import type { ReactNode } from 'react'
import type { EditorModeValue } from '../common/editor-mode'
import type { EditorSession } from '../common/editor-session'
import { EditorCanvas } from '../common/editor-canvas'
import './document-content.stylex'

export function DocumentEditor({
  children,
  embedded,
  focusBlockId,
  mode,
  readOnly,
  session,
  taskDate,
}: {
  children?: ReactNode
  embedded: boolean
  focusBlockId?: string
  mode: EditorModeValue
  readOnly: boolean
  session: EditorSession
  taskDate?: string
}) {
  return (
    <EditorCanvas
      embedded={embedded}
      focusBlockId={focusBlockId}
      mode={mode}
      modeControls={children}
      readOnly={readOnly}
      session={session}
      taskDate={taskDate}
    />
  )
}
