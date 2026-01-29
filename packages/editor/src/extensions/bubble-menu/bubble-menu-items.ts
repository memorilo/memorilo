import type { Editor } from '@tiptap/core'
import type { ComponentType } from 'react'
import { BoldIcon } from '@memorilo/components/ui/animated-icons/bold'
import { ItalicIcon } from '@memorilo/components/ui/animated-icons/italic'
import { StrikethroughIcon } from '@memorilo/components/ui/animated-icons/strikethrough'
import { TerminalIcon } from '@memorilo/components/ui/animated-icons/terminal'
import { UnderlineIcon } from '@memorilo/components/ui/animated-icons/underline'

export interface BubbleMenuItem {
  name: 'bold' | 'italic' | 'underline' | 'strike' | 'code'
  labelKey: string
  Icon: ComponentType<{ size?: number }>
  command: (editor: Editor) => void
}

export const bubbleMenuItems: BubbleMenuItem[] = [
  {
    name: 'bold',
    labelKey: 'editor.bubble.bold',
    Icon: BoldIcon,
    command: editor => editor.chain().focus().toggleBold().run(),
  },
  {
    name: 'italic',
    labelKey: 'editor.bubble.italic',
    Icon: ItalicIcon,
    command: editor => editor.chain().focus().toggleItalic().run(),
  },
  {
    name: 'underline',
    labelKey: 'editor.bubble.underline',
    Icon: UnderlineIcon,
    command: editor => editor.chain().focus().toggleUnderline().run(),
  },
  {
    name: 'strike',
    labelKey: 'editor.bubble.strikethrough',
    Icon: StrikethroughIcon,
    command: editor => editor.chain().focus().toggleStrike().run(),
  },
  {
    name: 'code',
    labelKey: 'editor.bubble.code',
    Icon: TerminalIcon,
    command: editor => editor.chain().focus().toggleCode().run(),
  },
]
