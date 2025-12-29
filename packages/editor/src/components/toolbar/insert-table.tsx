import { LuGrid2X2Plus } from 'react-icons/lu'
import { useSlateStatic } from 'slate-react'
import { TableEditor } from 'slate-table'
import { UtilButton } from '../util-button'

export function InsertTableToolbarButton() {
  const editor = useSlateStatic()
  return (
    <UtilButton
      onClick={() => {
        TableEditor.insertTable(editor, { rows: 3, cols: 3 })
      }}
    >
      <LuGrid2X2Plus />
    </UtilButton>

  )
}
