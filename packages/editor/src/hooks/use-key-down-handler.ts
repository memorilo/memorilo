import type { KeyboardEvent } from 'react'
import type { MemoriloElementStrings, MemoriloMarkupStrings } from '../slate'
import { Array } from 'effect'
import isHotKey from 'is-hotkey'
import { useCallback } from 'react'
import { Editor, Element, Node, Path, Range, Transforms } from 'slate'
import { useSlateStatic } from 'slate-react'
import { ELEMENTS } from '../components/elements'
import { MARKUPS } from '../components/markups'
import { toggleCurrentBlock, toggleMark } from '../lib/editorHelper'
import { isCodeblock, isCodeLine, isIndent } from '../lib/element-type'

export function useKeyDownHandler() {
  const editor = useSlateStatic()
  return useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    // Handle Shift+Tab (Outdent)
    if (isHotKey('shift+tab', event)) {
      event.preventDefault()
      const { selection } = editor
      if (selection) {
        Transforms.liftNodes(editor, {
          match: n => isIndent(n),
          mode: 'lowest',
        })
      }
      return
    }

    // Handle Tab key
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

      // Indent logic
      const [start, end] = Range.edges(editor.selection)
      const startBlockEntry = Editor.above(editor, {
        at: start,
        match: n => isIndent(n),
        mode: 'lowest',
      })
      const endBlockEntry = Editor.above(editor, {
        at: end,
        match: n => isIndent(n),
        mode: 'lowest',
      })

      if (startBlockEntry && endBlockEntry) {
        const [, startPath] = startBlockEntry
        const [, endPath] = endBlockEntry

        const commonPath = Path.common(startPath, endPath)
        const relativeStart = Path.relative(startPath, commonPath)
        const relativeEnd = Path.relative(endPath, commonPath)

        // If startPath is the same as commonPath, it means we selected the parent block itself
        // In this case, we treat it as selecting the block at commonPath
        const startIndex = relativeStart.length === 0 ? commonPath[commonPath.length - 1] : relativeStart[0]
        const endIndex = relativeEnd.length === 0 ? commonPath[commonPath.length - 1] : relativeEnd[0]

        // If we are moving the block itself (relativeStart is empty), we need to look at its parent
        const parentPath = relativeStart.length === 0 ? Path.parent(commonPath) : commonPath
        const parentNode = Node.get(editor, parentPath)

        if (startIndex > 0 && (Element.isElement(parentNode) || Editor.isEditor(parentNode))) {
          const previousSibling = parentNode.children[startIndex - 1]
          if (isIndent(previousSibling)) {
            const targetIndex = previousSibling.children.length

            const count = endIndex - startIndex + 1
            for (let i = 0; i < count; i++) {
              Transforms.moveNodes(editor, {
                at: [...parentPath, startIndex],
                to: [...parentPath, startIndex - 1, targetIndex + i],
              })
            }
          }
        }
      }
      return
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
