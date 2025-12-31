import { LuGrid2X2Plus } from 'react-icons/lu'
import { useSlateStatic } from 'slate-react'
import { insertDefaultTable } from '../elements/table/table-utils'
import { ToolbarIconButton } from './icon-button'

export function InsertTableToolbarButton() {
  const editor = useSlateStatic()
  return (
    <ToolbarIconButton
      label="Insert table"
      onClick={() => {
        insertDefaultTable(editor)
      }}
    >
      <LuGrid2X2Plus />
    </ToolbarIconButton>

  )
}
