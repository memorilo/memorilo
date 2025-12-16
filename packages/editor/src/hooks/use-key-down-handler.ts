import type { KeyboardEvent } from 'react'
import type { MemoriloElementStrings, MemoriloMarkupStrings } from '../slate'
import { Array } from 'effect'
import isHotKey from 'is-hotkey'
import { useCallback } from 'react'
import { Transforms } from 'slate'
import { useSlateStatic } from 'slate-react'
import { ELEMENTS } from '../components/elements'
import { MARKUPS } from '../components/markups'
import { toggleCurrentBlock, toggleMark } from '../lib/editorHelper'
import { isCodeblock, isCodeLine } from '../lib/element-type'

export function useKeyDownHandler() {
  const editor = useSlateStatic()
  return useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    // Handle Tab key for code lines
    if (isHotKey('tab', event) && editor.selection) {
      event.preventDefault()
      const path = editor.selection.focus.path
      const nodes = editor.nodes({
        at: path,
      })
      for (const nodeEntry of Array.reverse(nodes)) {
        const [node] = nodeEntry
        if (isCodeLine(node) || isCodeblock(node)) {
          editor.insertText('  ')
          return
        }
      }
    }
    // Handle soft line breaks (So Shift + Enter won't create new paragraph)
    if (isHotKey('shift+enter', event)) {
      event.preventDefault()
      Transforms.insertText(editor, '\n')
      return
    }

    // Handle arrow up and arrow left and focus to title
    if (
      (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      && editor.selection?.anchor.path[0] === 0
      && editor.selection?.anchor.offset === 0
    ) {
      event.preventDefault()
      // TODO: focus title
      return
    }

    // Handle Ctrl keys
    if (event.ctrlKey) {
      // Match key combination for elements
      const match = Object.entries(ELEMENTS).find(([, { key }]) => key[0] === 'ctrl' && key[1] === event.key)
      if (match) {
        event.preventDefault()
        toggleCurrentBlock(editor, match[0] as MemoriloElementStrings)
        return
      }

      // Match key combination for markups
      const match_m = Object.entries(MARKUPS).find(([, { key }]) => key[0] === 'ctrl' && key[1] === event.key)
      if (match_m) {
        event.preventDefault()
        toggleMark(editor, match_m[0] as MemoriloMarkupStrings)
      }
    }
  }, [editor])
}
