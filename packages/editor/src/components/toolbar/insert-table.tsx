import { useTranslation } from 'react-i18next'
import { LuGrid2X2Plus } from 'react-icons/lu'
import { useSlateStatic } from 'slate-react'
import { insertDefaultTable } from '../elements/table/table-utils'
import { ToolbarIconButton } from './icon-button'

export function InsertTableToolbarButton() {
  const { t } = useTranslation('app')
  const editor = useSlateStatic()
  return (
    <ToolbarIconButton
      label={t('editor.table.toolbar.insertTitle')}
      onClick={() => {
        insertDefaultTable(editor)
      }}
    >
      <LuGrid2X2Plus />
    </ToolbarIconButton>

  )
}
