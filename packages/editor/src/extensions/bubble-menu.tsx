import type { Editor } from '@tiptap/core'
import type { ComponentType } from 'react'
import { BoldIcon } from '@memorilo/components/ui/animiated-icons/bold'
import { ItalicIcon } from '@memorilo/components/ui/animiated-icons/italic'
import { StrikethroughIcon } from '@memorilo/components/ui/animiated-icons/strikethrough'
import { TerminalIcon } from '@memorilo/components/ui/animiated-icons/terminal'
import { UnderlineIcon } from '@memorilo/components/ui/animiated-icons/underline'
import { Button } from '@memorilo/components/ui/button'
import { cn } from '@memorilo/utils'
import { BubbleMenu } from '@tiptap/react/menus'

type BubbleMenuItem = {
  name: 'bold' | 'italic' | 'underline' | 'strike' | 'code'
  label: string
  Icon: ComponentType<{ size?: number }>
  command: (editor: Editor) => void
}

const bubbleMenuItems: BubbleMenuItem[] = [
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

type BubbleMenuButtonProps = {
  label: string
  active: boolean
  Icon: ComponentType<{ size?: number }>
  onClick: () => void
}

function BubbleMenuButton({ label, active, Icon, onClick }: BubbleMenuButtonProps) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={cn('h-8 w-8 px-0', active && 'bg-accent text-accent-foreground')}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Icon size={16} />
    </Button>
  )
}

type EditorBubbleMenuProps = {
  editor: Editor
}

export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top' }}
      className="flex items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      shouldShow={({ editor: currentEditor, state }) =>
        currentEditor.isEditable && !state.selection.empty}
    >
      {bubbleMenuItems.map(item => (
        <BubbleMenuButton
          key={item.name}
          label={item.label}
          active={editor.isActive(item.name)}
          Icon={item.Icon}
          onClick={() => item.command(editor)}
        />
      ))}
    </BubbleMenu>
  )
}
