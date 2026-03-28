import type { Editor } from '@tiptap/core'
import { useEffect, useState } from 'react'

export function useEditorSelectionUpdate(editor: Editor) {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const update = () => forceUpdate(value => value + 1)

    editor.on('selectionUpdate', update)
    editor.on('transaction', update)

    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', update)
    }
  }, [editor])
}
