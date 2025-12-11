import type { KeyboardEventHandler } from 'react'
import type { Descendant } from 'slate'
import type { RenderElementProps, RenderLeafProps } from 'slate-react'
import type { MemoriloElementStrings, MemoriloMarkupStrings } from './slate'
import { cn } from '@memorilo/utils'
import { useCallback, useMemo } from 'react'
import { createEditor, Editor, Range, Transforms } from 'slate'
import { withHistory } from 'slate-history'
import { DefaultLeaf, Editable, Slate, withReact } from 'slate-react'

import { ElementWrapper } from './components/element-wrapper'

import { ELEMENTS } from './components/elements'
import { FormatToolbar, ToolbarProvider } from './components/format-toolbar'

import { MARKUPS } from './components/markups'
import { isBlockActive, toggleCurrentBlock, toggleMark } from './lib/editorHelper'
import { withImages } from './lib/withImages'

const initialValue: Descendant[] = [
  { type: 'h1', children: [{ text: 'Memorilo Editor Demo' }] },
  {
    type: 'plain',
    children: [
      {
        strikethrough: true,
        bold: true,
        text: 'Here is a bug, see the left of the node. The button is duplicated when hovering.',
      },
      {
        type: 'image',
        url: 'https://github.com/mslxl/wallpapers/blob/main/pixiv-100312789.jpg?raw=true',
        children: [{ text: 'Image' }],
      },
      {
        type: 'image',
        url: 'https://github.com/mslxl/wallpapers/blob/main/twitter-1774762746007204094.jpg?raw=true',
        children: [{ text: '' }],
      },
      {
        type: 'image',
        url: 'https://github.com/mslxl/wallpapers/blob/main/121308490_p0.jpg?raw=true',
        children: [{ text: '' }],
      },
    ],
  },
  { type: 'quote', children: [{ text: 'A Notion-style rich text editor, still under active development and polishing.' }] },
  {
    type: 'plain',
    children: [
      {
        text: 'This project aims to replicate key features of Notion, the popular productivity tool. This page demonstrates the capabilities of this rich text editor.',
      },
    ],
  },
  { type: 'h2', children: [{ text: 'Features' }] },
  {
    type: 'todo',
    checked: true,
    children: [
      { text: '✍️ Essential formatting (' },
      { text: 'bold', bold: true },
      { text: ', ' },
      { italic: true, text: 'italic' },
      { text: ', ' },
      { text: 'underline', underline: true },
      { text: ', ' },
      { text: 'strikethrough', strikethrough: true },
      { text: ', ' },
      { text: 'code snippet', codesnippet: true },
      { text: ')' },
    ],
  },
  {
    type: 'todo',
    checked: true,
    children: [{ text: '📄 Fundamental blocks (headings, code blocks, quotes, checklists, dividers)' }],
  },
  {
    type: 'todo',
    checked: true,
    children: [
      {
        text: '🖼️ Image handling (insert via URL paste 🔗 or drag-and-drop)',
      },
    ],
  },
  {
    type: 'todo',
    checked: true,
    children: [{ text: '🖌️ Floating toolbar (select text or click the side "..." menu)' }],
  },
  {
    type: 'todo',
    checked: true,
    children: [
      {
        text: '⌨️ Keyboard shortcuts (hover over toolbar buttons to view shortcuts)',
      },
    ],
  },
  {
    type: 'todo',
    checked: false,
    children: [
      {
        text: 'Table is not supported!!! The feature will be impl later',
      },
    ],
  },
  {
    type: 'todo',
    checked: false,
    children: [
      {
        text: 'No Math Equation too',
      },
    ],
  },
  {
    type: 'todo',
    checked: false,
    children: [
      {
        text: 'The same as code highlighting',
      },
    ],
  },
  { children: [{ text: 'd' }], type: 'divider' },
  { children: [{ text: 'Time for a demo!' }], type: 'h3' },
  {
    type: 'plain',
    children: [
      { text: 'Try selecting this text and clicking "H1" or pressing ' },
      { text: 'Ctrl + 1', codesnippet: true },
      { text: '. Hover over buttons to see shortcuts! You can also select text and press ' },
      { text: 'Ctrl + B.', codesnippet: true },
    ],
  },
  {
    type: 'plain',
    children: [
      { text: 'Pressing ' },
      { text: 'Enter', codesnippet: true },
      { text: ' creates a new block.\nUse ' },
      { text: 'Shift + Enter', codesnippet: true },
      { text: ' for a soft line break within the block!' },
    ],
  },
  {
    type: 'plain',
    children: [
      { text: 'You can also insert ' },
      { text: 'console.log("inline code!")', codesnippet: true },
      { text: '. Neat.' },
    ],
  },
  { type: 'h3', children: [{ text: 'Code block example:' }] },
  { type: 'code', children: [{ text: 'console.log("Noshon 🫶")' }] },
  { type: 'plain', children: [{ text: '' }] },
]

interface MemoriloEditorProps {
  className?: string
}
export function MemoriloEditor({ className }: MemoriloEditorProps) {
  const editor = useMemo(() => withImages(withHistory(withReact(createEditor()))), [])

  const handleKeyDown = (event: KeyboardEvent) => {
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
        return
      }
    }

    // Handle soft line breaks (So Shift + Enter won't create new paragraph)
    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault()
      Transforms.insertText(editor, '\n')
    }
  }

  const renderElement = useCallback((props: RenderElementProps) => {
    const Element
      = props.element.type === undefined ? ELEMENTS.plain.component : ELEMENTS[props.element.type].component

    return (
      <ElementWrapper {...props}>
        <Element {...props} />
      </ElementWrapper>
    )
  }, [])

  const renderLeaf = useCallback(
    (props: RenderLeafProps) => {
      if (props.leaf.placeholder && isBlockActive(editor, 'plain')) {
        return (
          <>
            <span className="pointer-events-none absolute top-0 bg-transparent opacity-30" contentEditable={false}>
              Type &apos;/&apos; for commands
            </span>
            <DefaultLeaf {...props} />
          </>
        )
      }

      return (
        <span
          className={Object.entries(MARKUPS)
            .map(([name, value]) => {
              if (props.leaf[name as MemoriloMarkupStrings]) {
                return value.className
              }
              else {
                return ''
              }
            })
            .join(' ')}
          {...props.attributes}
        >
          {props.children}
        </span>
      )
    },
    [editor],
  )
  return (
    <ToolbarProvider>
      <Slate editor={editor} initialValue={initialValue}>
        <FormatToolbar />
        <Editable
          autoFocus
          className={cn('h-full w-full space-y-3 py-8 px-2 md:p-8', className)}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          onKeyDown={handleKeyDown as unknown as KeyboardEventHandler<HTMLDivElement>}
          decorate={([node, path]) => {
            if (editor.selection != null) {
              if (
                !Editor.isEditor(node)
                && Editor.string(editor, [path[0]]) === ''
                && Range.includes(editor.selection, path)
                && Range.isCollapsed(editor.selection)
              ) {
                return [
                  {
                    ...editor.selection,
                    placeholder: true,
                  },
                ]
              }
            }
            return []
          }}
        />
      </Slate>
    </ToolbarProvider>
  )
}
