import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { CellSelection } from '@tiptap/pm/tables'
import { BubbleMenu } from '@tiptap/react/menus'
import { useTranslation } from 'react-i18next'
import { BubbleMenuButton } from './bubble-menu-button'
import { bubbleMenuItems } from './bubble-menu-items'
import { HeadingSelect } from './heading-select'
import { HighlightMenu } from './highlight-menu'
import { TableMenu } from './table-menu'
import { useEditorSelectionUpdate } from './use-editor-selection-update'

interface EditorBubbleMenuProps {
  editor: Editor
}

function isSelectionInTable(state: EditorState) {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.spec.tableRole) {
      return true
    }
  }
  return false
}

function shouldShowBubbleMenu(state: EditorState) {
  const { selection } = state
  const isInTable = isSelectionInTable(state)
  const isCellSelection = selection instanceof CellSelection
  const hasRangeSelection = selection.from !== selection.to
  if (isInTable) {
    return hasRangeSelection || isCellSelection
  }
  return hasRangeSelection
}

export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const { t } = useTranslation('app')
  useEditorSelectionUpdate(editor)
  const isTableSelection = isSelectionInTable(editor.state)
  const showMenu = shouldShowBubbleMenu(editor.state)

  return (
    <>
      <BubbleMenu
        editor={editor}
        options={{ placement: 'top' }}
        className="rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        shouldShow={({ editor: currentEditor, state }) =>
          currentEditor.isEditable && shouldShowBubbleMenu(state)}
      >
        <div className="flex flex-col gap-1">
          {showMenu && isTableSelection ? <TableMenu editor={editor} /> : null}
          {showMenu
            ? (
                <div className="flex items-center gap-1">
                  <HeadingSelect editor={editor} />
                  {bubbleMenuItems.map(item => (
                    <BubbleMenuButton
                      key={item.name}
                      label={t(item.labelKey)}
                      active={editor.isActive(item.name)}
                      Icon={item.Icon}
                      onClick={() => item.command(editor)}
                    />
                  ))}
                  <HighlightMenu editor={editor} />
                </div>
              )
            : null}
        </div>
      </BubbleMenu>
    </>
  )
}
