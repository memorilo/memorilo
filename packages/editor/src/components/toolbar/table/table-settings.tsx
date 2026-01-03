import type { TableState } from './table-settings-utils'
import { Button } from '@memorilo/components/ui/button'
import { Input } from '@memorilo/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { Switch } from '@memorilo/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { parsePositiveInt } from '@memorilo/utils'
import { Option, pipe } from 'effect'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TbTableOptions } from 'react-icons/tb'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { UtilButton } from '../../util-button'
import { applyTableSettings, getTableState } from './table-settings-utils'

export function TableSettingsButton() {
  const tableState = useSlateSelector(useCallback(editor => getTableState(editor), []))

  if (!tableState)
    return null

  return (
    <TableSettingsButtonInner
      key={tableState.signature}
      tableState={tableState}
    />
  )
}

function TableSettingsButtonInner({ tableState }: { tableState: TableState }) {
  const { t } = useTranslation('app')
  const editor = useSlateStatic()
  const [open, setOpen] = useState(false)
  const [rowInput, setRowInput] = useState(() => String(tableState.rowCount))
  const [colInput, setColInput] = useState(() => String(tableState.columnCount))
  const [hideHeader, setHideHeader] = useState(() => !tableState.hasHeader)

  const parsedRows = useMemo(
    () => pipe(
      parsePositiveInt(rowInput),
      Option.getOrElse(() => tableState.rowCount),
    ),
    [rowInput, tableState.rowCount],
  )
  const parsedColumns = useMemo(
    () => pipe(
      parsePositiveInt(colInput),
      Option.getOrElse(() => tableState.columnCount),
    ),
    [colInput, tableState.columnCount],
  )

  const isDirty = parsedRows !== tableState.rowCount
    || parsedColumns !== tableState.columnCount
    || hideHeader !== !tableState.hasHeader

  const resetForm = () => {
    setRowInput(String(tableState.rowCount))
    setColInput(String(tableState.columnCount))
    setHideHeader(!tableState.hasHeader)
  }

  const apply = () => {
    applyTableSettings(editor, tableState, {
      rowCount: parsedRows,
      columnCount: parsedColumns,
      hasHeader: !hideHeader,
    })
    setOpen(false)
    ReactEditor.focus(editor)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen)
          ReactEditor.focus(editor)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <span className="inline-flex">
              <UtilButton
                aria-label={t('editor.table.toolbar.settingsTitle')}
                title={t('editor.table.toolbar.settingsTitle')}
              >
                <TbTableOptions />
              </UtilButton>
            </span>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>
          {t('editor.table.toolbar.settingsTitle')}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        className="w-64 space-y-3"
        onOpenAutoFocus={e => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          ReactEditor.focus(editor)
        }}
        onMouseDown={(e) => {
          // Allow inputs inside the toolbar popover to receive focus.
          e.stopPropagation()
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{t('editor.table.settings.rows')}</span>
          <Input
            type="number"
            min={1}
            value={rowInput}
            onChange={e => setRowInput(e.target.value)}
            className="h-8 w-20"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{t('editor.table.settings.columns')}</span>
          <Input
            type="number"
            min={1}
            value={colInput}
            onChange={e => setColInput(e.target.value)}
            className="h-8 w-20"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{t('editor.table.settings.hideHeader')}</span>
          <Switch checked={hideHeader} onCheckedChange={setHideHeader} />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetForm}
          >
            {t('editor.table.settings.reset')}
          </Button>
          <Button
            size="sm"
            disabled={!isDirty}
            onClick={(event) => {
              event.preventDefault()
              apply()
            }}
          >
            {t('editor.table.toolbar.apply')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
