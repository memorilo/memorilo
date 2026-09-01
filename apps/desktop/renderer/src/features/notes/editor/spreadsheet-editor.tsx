import type { EditorSpreadsheetTopicDocument } from '@memorilo/editor'
import type {
  SpreadsheetCellFormat,
  SpreadsheetLock,
  SpreadsheetStrings,
  SpreadsheetToolbarCommand,
  SpreadsheetWorkbookProjection,
} from '@memorilo/spreadsheet'
import { SpreadsheetWorkspace } from '@memorilo/spreadsheet'
import * as stylex from '@stylexjs/stylex'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessage } from '../../../shared/error-message'
import { spreadsheetEditorStyles as styles } from './spreadsheet-editor.stylex'

const localSpreadsheetLock: SpreadsheetLock = {
  owner: {
    color: 'rgb(0 113 227)',
    id: 'local-editor',
    initials: 'ME',
    name: 'Local editor',
  },
  state: 'owned',
}

const enabledToolbarCommands: readonly SpreadsheetToolbarCommand[] = [
  'align-center',
  'align-left',
  'align-right',
  'bold',
  'currency',
  'italic',
  'percent',
  'underline',
]

interface SpreadsheetEditorState {
  activeSheetId: string
  workbook: SpreadsheetWorkbookProjection
}

function firstSheetId(workbook: SpreadsheetWorkbookProjection): string {
  const sheet = workbook.sheets[0]
  if (!sheet)
    throw new Error('Spreadsheet Workbook must contain at least one Sheet')
  return sheet.id
}

function initialState(topic: EditorSpreadsheetTopicDocument): SpreadsheetEditorState {
  const workbook = topic.getWorkbook()
  return { activeSheetId: firstSheetId(workbook), workbook }
}

function nextCellFormat(
  command: SpreadsheetToolbarCommand,
  current: SpreadsheetCellFormat,
): SpreadsheetCellFormat | null {
  if (command === 'bold' || command === 'italic' || command === 'underline')
    return { ...current, [command]: !current[command] }
  if (command === 'align-left')
    return { ...current, alignment: 'left' }
  if (command === 'align-center')
    return { ...current, alignment: 'center' }
  if (command === 'align-right')
    return { ...current, alignment: 'right' }
  if (command === 'currency') {
    const { kind, ...rest } = current
    return kind === 'currency' ? rest : { ...current, kind: 'currency' }
  }
  if (command === 'percent') {
    const { kind, ...rest } = current
    return kind === 'percent' ? rest : { ...current, kind: 'percent' }
  }
  return null
}

export function SpreadsheetEditor({
  title,
  topic,
}: {
  title: string
  topic: EditorSpreadsheetTopicDocument
}) {
  const { t } = useTranslation('editor')
  const [state, setState] = useState(() => initialState(topic))
  const [error, setError] = useState<string | null>(null)
  const strings = useMemo<SpreadsheetStrings>(() => ({
    addSheet: t('spreadsheet.addSheet'),
    alignCenter: t('spreadsheet.alignCenter'),
    alignLeft: t('spreadsheet.alignLeft'),
    alignRight: t('spreadsheet.alignRight'),
    bold: t('spreadsheet.bold'),
    cellName: t('spreadsheet.cellName'),
    color: t('spreadsheet.color'),
    currency: t('spreadsheet.currency'),
    formula: t('spreadsheet.formula'),
    italic: t('spreadsheet.italic'),
    lockAcquiring: t('spreadsheet.lockAcquiring'),
    lockAvailable: t('spreadsheet.lockAvailable'),
    lockHeldBy: name => t('spreadsheet.lockHeldBy', { name }),
    lockOwned: t('spreadsheet.lockOwned'),
    more: t('spreadsheet.more'),
    percent: t('spreadsheet.percent'),
    redo: t('spreadsheet.redo'),
    releaseEdit: t('spreadsheet.releaseEdit'),
    requestEdit: t('spreadsheet.requestEdit'),
    textStyle: t('spreadsheet.textStyle'),
    underline: t('spreadsheet.underline'),
    undo: t('spreadsheet.undo'),
  }), [t])

  useEffect(() => {
    let active = true
    const refresh = () => {
      if (!active)
        return
      const workbook = topic.getWorkbook()
      setState(current => ({
        activeSheetId: workbook.sheets.some(sheet => sheet.id === current.activeSheetId)
          ? current.activeSheetId
          : firstSheetId(workbook),
        workbook,
      }))
    }
    const unsubscribe = topic.subscribe(refresh)
    queueMicrotask(refresh)
    return () => {
      active = false
      unsubscribe()
    }
  }, [topic])

  const apply = useCallback((operation: () => void) => {
    try {
      operation()
      setError(null)
    }
    catch (cause) {
      setError(errorMessage(cause))
    }
  }, [])

  const addSheet = useCallback(() => apply(() => {
    const usedNames = new Set(state.workbook.sheets.map(sheet => sheet.name))
    let number = state.workbook.sheets.length + 1
    let name = t('spreadsheet.sheetName', { number })
    while (usedNames.has(name)) {
      number += 1
      name = t('spreadsheet.sheetName', { number })
    }
    const sheetId = crypto.randomUUID()
    topic.apply([{
      columns: Array.from({ length: 12 }, () => ({ id: crypto.randomUUID() })),
      name,
      rows: Array.from({ length: 50 }, () => ({ id: crypto.randomUUID() })),
      sheetId,
      type: 'add-sheet',
    }])
    setState(current => ({ ...current, activeSheetId: sheetId }))
  }), [apply, state.workbook.sheets, t, topic])

  const runToolbarCommand = useCallback((
    command: SpreadsheetToolbarCommand,
    target: {
      cell: { format: SpreadsheetCellFormat }
      columnId: string
      rowId: string
      sheetId: string
    },
  ) => apply(() => {
    const format = nextCellFormat(command, target.cell.format)
    if (format === null)
      return
    topic.apply([{
      columnId: target.columnId,
      format,
      rowId: target.rowId,
      sheetId: target.sheetId,
      type: 'set-cell-format',
    }])
  }), [apply, topic])

  return (
    <div {...stylex.props(styles.root)}>
      <SpreadsheetWorkspace
        activeSheetId={state.activeSheetId}
        ariaLabel={title}
        enabledToolbarCommands={enabledToolbarCommands}
        lock={localSpreadsheetLock}
        strings={strings}
        workbook={state.workbook}
        onActiveSheetChange={activeSheetId => setState(current => ({ ...current, activeSheetId }))}
        onAddSheet={addSheet}
        onCellCommit={(sheetId, rowId, columnId, input) => apply(() => {
          topic.apply([{ columnId, input, rowId, sheetId, type: 'set-cell-input' }])
        })}
        onLockRelease={() => undefined}
        onLockRequest={() => undefined}
        onToolbarCommand={runToolbarCommand}
      />
      {error
        ? <div {...stylex.props(styles.error)} aria-live="assertive" role="alert">{error}</div>
        : null}
    </div>
  )
}
