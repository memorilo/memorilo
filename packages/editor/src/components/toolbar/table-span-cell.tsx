import { useTranslation } from 'react-i18next'
import { LuTableCellsMerge } from 'react-icons/lu'
import { useSlateStatic } from 'slate-react'
import { TableEditor } from 'slate-table'
import { useTable } from '../elements/table/table-provider'
import { ToolbarIconButton } from './icon-button'

export function TableSpanCellToolbarButtons() {
  const { t } = useTranslation('app')
  const { canMerge } = useTable()
  const editor = useSlateStatic()

  return (
    <>

      <ToolbarIconButton
        disabled={!canMerge}
        onClick={() => TableEditor.merge(editor)}
        label={t('editor.table.toolbar.mergeCell')}
      >
        <LuTableCellsMerge />
      </ToolbarIconButton>
    </>
  )
}
