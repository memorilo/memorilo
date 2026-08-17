import type { WhiteboardEditorProps } from '@memorilo/editor'
import { WhiteboardEditor as SharedWhiteboardEditor } from '@memorilo/editor'
import { whiteboardLibraryPersistenceAdapter } from './whiteboard-library-storage'

export function WhiteboardEditor(
  props: Omit<WhiteboardEditorProps, 'libraryPersistenceAdapter'>,
) {
  return (
    <SharedWhiteboardEditor
      {...props}
      libraryPersistenceAdapter={whiteboardLibraryPersistenceAdapter}
    />
  )
}
