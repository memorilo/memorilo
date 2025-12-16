import type { RefAttributes, TextareaHTMLAttributes } from 'react'
import type { Descendant } from 'slate'
import { cn } from '@memorilo/utils'
import { useMemo } from 'react'
import { createEditor } from 'slate'
import { withHistory } from 'slate-history'
import { Editable, Slate, withReact } from 'slate-react'
import { FormatToolbar, ToolbarProvider } from './components/format-toolbar'
import { useDecorate } from './hooks/use-decorate'
import { useKeyDownHandler } from './hooks/use-key-down-handler'
import { useRenderElement } from './hooks/use-render-element'
import { useRenderLeaf } from './hooks/use-render-leaf'
import { toCodeLines } from './lib/code'
import { withCodeblock } from './lib/with-codeblock'
import { withImages } from './lib/with-image'
import './globals.css'

const initialValue: Descendant[] = [
  { type: 'h1', children: [{ text: 'Memorilo Editor Demo' }] },
  {
    type: 'plain',
    children: [
      {
        type: 'plain',
        children: [
          {
            strikethrough: true,
            bold: true,
            text: 'Here is a bug, see the left of the node. The button is duplicated when hovering.',
          },
        ],
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
  { type: 'codeblock', children: toCodeLines(`
function ciallo(){
    console.log('Ciallo～(∠・ω< )')
}
    `.trim()) },
  { type: 'plain', children: [{ text: '' }] },
]

function MemoriloEditable({ className, ...props }: TextareaHTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>) {
  const decorate = useDecorate()
  const renderElement = useRenderElement()
  const renderLeaf = useRenderLeaf()
  const handleKeyDown = useKeyDownHandler()
  return (
    <>
      <FormatToolbar />
      <Editable
        autoFocus
        className={cn('w-full space-y-3 py-8 px-2 md:p-8 memorilo-editor', className)}
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        onKeyDown={handleKeyDown}
        decorate={decorate}
        {...props}
      />
    </>
  )
}

export function MemoriloEditor(props: TextareaHTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement>) {
  const editor = useMemo(() => withCodeblock(withImages(withHistory(withReact(createEditor())))), [])

  return (
    <ToolbarProvider>
      <Slate
        editor={editor}
        initialValue={initialValue}
      >
        <MemoriloEditable {...props} />
      </Slate>
    </ToolbarProvider>
  )
}
