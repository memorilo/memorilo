'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'
import type { Uploader } from 'prosekit/extensions/file'
import * as stylex from '@stylexjs/stylex'
import {
  Bold,
  Code2,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react'
import { useEditorDerivedValue } from 'prosekit/react'

import { editorStyles } from '../../styles/editor.stylex'
import { Button } from '../button/index.ts'
import { ImageUploadPopover } from '../image-upload-popover/index.ts'

function getToolbarItems(editor: Editor<BasicExtension>) {
  return {
    blockquote: {
      active: editor.nodes.blockquote.isActive(),
      canExec: editor.commands.toggleBlockquote.canExec(),
      run: () => editor.commands.toggleBlockquote(),
    },
    bold: {
      active: editor.marks.bold.isActive(),
      canExec: editor.commands.toggleBold.canExec(),
      run: () => editor.commands.toggleBold(),
    },
    bulletList: {
      active: editor.nodes.list.isActive({ kind: 'bullet' }),
      canExec: editor.commands.toggleList.canExec({ kind: 'bullet' }),
      run: () => editor.commands.toggleList({ kind: 'bullet' }),
    },
    codeBlock: {
      active: editor.nodes.codeBlock.isActive(),
      canExec: editor.commands.insertCodeBlock.canExec({ language: 'javascript' }),
      run: () => editor.commands.insertCodeBlock({ language: 'javascript' }),
    },
    heading1: {
      active: editor.nodes.heading.isActive({ level: 1 }),
      canExec: editor.commands.toggleHeading.canExec({ level: 1 }),
      run: () => editor.commands.toggleHeading({ level: 1 }),
    },
    heading2: {
      active: editor.nodes.heading.isActive({ level: 2 }),
      canExec: editor.commands.toggleHeading.canExec({ level: 2 }),
      run: () => editor.commands.toggleHeading({ level: 2 }),
    },
    horizontalRule: {
      active: false,
      canExec: editor.commands.insertHorizontalRule.canExec(),
      run: () => editor.commands.insertHorizontalRule(),
    },
    image: {
      canExec: editor.commands.insertImage.canExec(),
    },
    italic: {
      active: editor.marks.italic.isActive(),
      canExec: editor.commands.toggleItalic.canExec(),
      run: () => editor.commands.toggleItalic(),
    },
    orderedList: {
      active: editor.nodes.list.isActive({ kind: 'ordered' }),
      canExec: editor.commands.toggleList.canExec({ kind: 'ordered' }),
      run: () => editor.commands.toggleList({ kind: 'ordered' }),
    },
    redo: {
      active: false,
      canExec: editor.commands.redo.canExec(),
      run: () => editor.commands.redo(),
    },
    strike: {
      active: editor.marks.strike.isActive(),
      canExec: editor.commands.toggleStrike.canExec(),
      run: () => editor.commands.toggleStrike(),
    },
    table: {
      active: editor.nodes.table.isActive(),
      canExec: editor.commands.insertTable.canExec({ row: 3, col: 3 }),
      run: () => editor.commands.insertTable({ row: 3, col: 3 }),
    },
    taskList: {
      active: editor.nodes.list.isActive({ kind: 'task' }),
      canExec: editor.commands.toggleList.canExec({ kind: 'task' }),
      run: () => editor.commands.toggleList({ kind: 'task' }),
    },
    underline: {
      active: editor.marks.underline.isActive(),
      canExec: editor.commands.toggleUnderline.canExec(),
      run: () => editor.commands.toggleUnderline(),
    },
    undo: {
      active: false,
      canExec: editor.commands.undo.canExec(),
      run: () => editor.commands.undo(),
    },
  }
}

const iconSize = 17

export default function Toolbar({ uploader }: { uploader: Uploader<string> }) {
  const items = useEditorDerivedValue(getToolbarItems)

  return (
    <div {...stylex.props(editorStyles.toolbar)} aria-label="Editor toolbar" role="toolbar">
      <Button disabled={!items.undo.canExec} onClick={items.undo.run} tooltip="Undo"><Undo2 size={iconSize} /></Button>
      <Button disabled={!items.redo.canExec} onClick={items.redo.run} tooltip="Redo"><Redo2 size={iconSize} /></Button>
      <span {...stylex.props(editorStyles.toolbarDivider)} />
      <Button pressed={items.bold.active} disabled={!items.bold.canExec} onClick={items.bold.run} tooltip="Bold"><Bold size={iconSize} /></Button>
      <Button pressed={items.italic.active} disabled={!items.italic.canExec} onClick={items.italic.run} tooltip="Italic"><Italic size={iconSize} /></Button>
      <Button pressed={items.underline.active} disabled={!items.underline.canExec} onClick={items.underline.run} tooltip="Underline"><Underline size={iconSize} /></Button>
      <Button pressed={items.strike.active} disabled={!items.strike.canExec} onClick={items.strike.run} tooltip="Strikethrough"><Strikethrough size={iconSize} /></Button>
      <span {...stylex.props(editorStyles.toolbarDivider)} />
      <Button pressed={items.heading1.active} disabled={!items.heading1.canExec} onClick={items.heading1.run} tooltip="Heading 1"><Heading1 size={iconSize} /></Button>
      <Button pressed={items.heading2.active} disabled={!items.heading2.canExec} onClick={items.heading2.run} tooltip="Heading 2"><Heading2 size={iconSize} /></Button>
      <Button pressed={items.bulletList.active} disabled={!items.bulletList.canExec} onClick={items.bulletList.run} tooltip="Bullet list"><List size={iconSize} /></Button>
      <Button pressed={items.orderedList.active} disabled={!items.orderedList.canExec} onClick={items.orderedList.run} tooltip="Ordered list"><ListOrdered size={iconSize} /></Button>
      <Button pressed={items.taskList.active} disabled={!items.taskList.canExec} onClick={items.taskList.run} tooltip="Task list"><ListChecks size={iconSize} /></Button>
      <Button pressed={items.blockquote.active} disabled={!items.blockquote.canExec} onClick={items.blockquote.run} tooltip="Blockquote"><Quote size={iconSize} /></Button>
      <span {...stylex.props(editorStyles.toolbarDivider)} />
      <Button pressed={items.codeBlock.active} disabled={!items.codeBlock.canExec} onClick={items.codeBlock.run} tooltip="Code block"><Code2 size={iconSize} /></Button>
      <Button pressed={items.table.active} disabled={!items.table.canExec} onClick={items.table.run} tooltip="Insert table"><Table2 size={iconSize} /></Button>
      <Button disabled={!items.horizontalRule.canExec} onClick={items.horizontalRule.run} tooltip="Divider"><Minus size={iconSize} /></Button>
      <ImageUploadPopover uploader={uploader} disabled={!items.image.canExec} tooltip="Insert image"><ImagePlus size={iconSize} /></ImageUploadPopover>
    </div>
  )
}
