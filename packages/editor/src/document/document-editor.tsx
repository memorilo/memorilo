import type { ReactNode } from 'react'
import type { EditorModeValue } from '../common/editor-mode'
import type { EditorSession } from '../common/editor-session'
import { EditorCanvas } from '../common/editor-canvas'
import './document-content.stylex'

export function DocumentEditor({
  blockHandles,
  children,
  embedded,
  focusBlockId,
  mode,
  readOnly,
  session,
  taskDate,
}: {
  children?: ReactNode
  blockHandles?: boolean
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
      blockHandles={blockHandles}
      focusBlockId={focusBlockId}
      mode={mode}
      modeControls={children}
      readOnly={readOnly}
      session={session}
      taskDate={taskDate}
    />
  )
}
