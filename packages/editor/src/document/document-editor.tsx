import type { ReactNode } from 'react'
import type { EditorSession } from '../common/editor-session'
import { EditorCanvas } from '../common/editor-canvas'

export function DocumentEditor({
  children,
  mode,
  session,
}: {
  children?: ReactNode
  mode: 'document' | 'outline'
  session: EditorSession
}) {
  return <EditorCanvas mode={mode} modeControls={children} session={session} />
}
