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
}: {
  children?: ReactNode
  embedded: boolean
  focusBlockId?: string
  mode: EditorModeValue
  readOnly: boolean
  session: EditorSession
}) {
  return (
    <EditorCanvas
      embedded={embedded}
      focusBlockId={focusBlockId}
      mode={mode}
      modeControls={children}
      readOnly={readOnly}
      session={session}
    />
  )
}
