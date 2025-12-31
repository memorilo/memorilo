import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { LuTableCellsMerge } from 'react-icons/lu'
import { useSlateSelector, useSlateStatic } from 'slate-react'
import { TableCursor, TableEditor } from 'slate-table'
import { useTable } from '../elements/table/table-provider'
import { ToolbarIconButton } from './icon-button'

export function TableSpanCellToolbarButtons() {
  const { t } = useTranslation('app')
  const { canMerge } = useTable()
  const isInTable = useSlateSelector(useCallback(editor => TableCursor.isInTable(editor), []))
  const editor = useSlateStatic()

  return (
    <>

      <ToolbarIconButton
        disabled={!isInTable && !canMerge}
        onClick={() => TableEditor.merge(editor)}
        label={t('editor.table.toolbar.mergeCell')}
      >
        <LuTableCellsMerge />
      </ToolbarIconButton>
    </>
  )
}
