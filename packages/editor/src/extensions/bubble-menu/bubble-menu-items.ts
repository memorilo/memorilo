import type { Editor } from '@tiptap/core'
import type { ComponentType } from 'react'
import { BoldIcon } from '@memorilo/components/ui/animiated-icons/bold'
import { ItalicIcon } from '@memorilo/components/ui/animiated-icons/italic'
import { StrikethroughIcon } from '@memorilo/components/ui/animiated-icons/strikethrough'
import { TerminalIcon } from '@memorilo/components/ui/animiated-icons/terminal'
import { UnderlineIcon } from '@memorilo/components/ui/animiated-icons/underline'

export interface BubbleMenuItem {
  name: 'bold' | 'italic' | 'underline' | 'strike' | 'code'
  label: string
  Icon: ComponentType<{ size?: number }>
  command: (editor: Editor) => void
}

export const bubbleMenuItems: BubbleMenuItem[] = [
  {
    name: 'bold',
    label: 'Bold',
    Icon: BoldIcon,
    command: editor => editor.chain().focus().toggleBold().run(),
  },
  {
    name: 'italic',
    label: 'Italic',
    Icon: ItalicIcon,
    command: editor => editor.chain().focus().toggleItalic().run(),
  },
  {
    name: 'underline',
    label: 'Underline',
    Icon: UnderlineIcon,
    command: editor => editor.chain().focus().toggleUnderline().run(),
  },
  {
    name: 'strike',
    label: 'Strikethrough',
    Icon: StrikethroughIcon,
    command: editor => editor.chain().focus().toggleStrike().run(),
  },
  {
    name: 'code',
    label: 'Code',
    Icon: TerminalIcon,
    command: editor => editor.chain().focus().toggleCode().run(),
  },
]
