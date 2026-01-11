import type { Editor } from '@tiptap/core'
import { BubbleMenu } from '@tiptap/react/menus'
import { BubbleMenuButton } from './bubble-menu-button'
import { bubbleMenuItems } from './bubble-menu-items'
import { HeadingSelect } from './heading-select'
import { useEditorSelectionUpdate } from './use-editor-selection-update'

interface EditorBubbleMenuProps {
  editor: Editor
}

export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  useEditorSelectionUpdate(editor)

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top' }}
      className="flex items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      shouldShow={({ editor: currentEditor, state }) =>
        currentEditor.isEditable && !state.selection.empty}
    >
      <HeadingSelect editor={editor} />
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
