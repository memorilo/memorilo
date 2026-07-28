import type { EditorSession } from '../common/editor-session'
import { EditorCanvas } from '../common/editor-canvas'

export function DocumentEditor({ session }: { session: EditorSession }) {
  return <EditorCanvas session={session} />
}
