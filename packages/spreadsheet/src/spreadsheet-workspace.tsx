import type { CSSProperties, KeyboardEvent } from 'react'
import type {
  SpreadsheetCell,
  SpreadsheetCellKind,
  SpreadsheetSelection,
  SpreadsheetSheet,
  SpreadsheetToolbarCommand,
  SpreadsheetWorkspaceProps,
} from './model'
import * as stylex from '@stylexjs/stylex'
import { Effect } from 'effect'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  CircleDollarSign,
  Italic,
  MoreHorizontal,
  PaintBucket,
  Percent,
  Plus,
  Redo2,
  Underline,
  Undo2,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import {
  readSpreadsheetCell,
  resolveSpreadsheetSelection,
  resolveSpreadsheetSheet,
  spreadsheetAddress,
  validateSpreadsheetLock,
  validateSpreadsheetWorkbook,
} from './spreadsheet-model'
import { spreadsheetStyles as styles } from './spreadsheet-workspace.stylex'

interface ToolbarButtonProps {
  readonly command: SpreadsheetToolbarCommand
  readonly disabled: boolean
  readonly icon: typeof Bold
  readonly label: string
  readonly onCommand?: (command: SpreadsheetToolbarCommand) => void
  readonly pressed?: boolean
}

interface CellEdit {
  readonly address: string
  readonly sheetId: string
  readonly source: 'cell' | 'formula'
  readonly value: string
}

interface SpreadsheetGridColumn {
  readonly index: number
  readonly label: string
}

interface SpreadsheetGridCell {
  readonly address: string
  readonly cell: SpreadsheetCell
  readonly column: number
}

interface SpreadsheetGridRow {
  readonly cells: readonly SpreadsheetGridCell[]
  readonly index: number
}

function ToolbarButton({ command, disabled, icon: Icon, label, onCommand, pressed = false }: ToolbarButtonProps) {
  return (
    <button
      {...stylex.props(styles.iconButton, pressed && styles.iconButtonPressed)}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      title={label}
      type="button"
      onClick={() => onCommand?.(command)}
    >
      <Icon aria-hidden="true" size={16} strokeWidth={2} />
    </button>
  )
}

function cellKindStyle(kind: SpreadsheetCellKind | undefined) {
  if (kind === 'currency')
    return styles.cellCurrency
  if (kind === 'number' || kind === 'percent')
    return styles.cellNumber
  return null
}

interface SpreadsheetWorkspaceContentProps extends SpreadsheetWorkspaceProps {
  readonly activeSheet: SpreadsheetSheet
}

function SpreadsheetWorkspaceContent({
  activeSheet,
  lock,
  onActiveSheetChange,
  onAddSheet,
  onCellCommit,
  onToolbarCommand,
  strings,
  workbook,
}: SpreadsheetWorkspaceContentProps) {
  const [preferredSelection, setPreferredSelection] = useState<SpreadsheetSelection>({ column: 0, row: 0 })
  const [edit, setEdit] = useState<CellEdit | null>(null)
  const editRef = useRef<CellEdit | null>(null)
  const selection = resolveSpreadsheetSelection(activeSheet, preferredSelection)
  const selectedAddress = Effect.runSync(spreadsheetAddress(selection, activeSheet))
  const selectedCell = Effect.runSync(readSpreadsheetCell(activeSheet, selectedAddress))
  const editable = lock.state === 'owned' && onCellCommit !== undefined
  const activeEdit = editable
    && edit?.sheetId === activeSheet.id
    && edit.address === selectedAddress
    ? edit
    : null
  const draft = activeEdit?.value ?? selectedCell.input
  const cellEditing = activeEdit?.source === 'cell'

  const replaceEdit = (next: CellEdit | null) => {
    editRef.current = next
    setEdit(next)
  }

  const finishEdit = (commit: boolean) => {
    const current = editRef.current
    if (!current)
      return
    replaceEdit(null)
    if (commit && editable)
      onCellCommit(current.sheetId, current.address, current.value)
  }

  const handleEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
    else if (event.key === 'Escape') {
      event.preventDefault()
      finishEdit(false)
      event.currentTarget.blur()
    }
  }

  const handleEditBlur = () => {
    finishEdit(true)
  }

  const selectCell = (row: number, column: number) => {
    finishEdit(true)
    setPreferredSelection({ column, row })
  }

  const gridStyle: CSSProperties = {
    gridTemplateColumns: `44px repeat(${activeSheet.columnCount}, 112px)`,
  }

  const { columns, rows } = useMemo(() => {
    const columns: SpreadsheetGridColumn[] = Array.from(
      { length: activeSheet.columnCount },
      (_, index) => ({
        index,
        label: Effect.runSync(spreadsheetAddress({ column: index, row: 0 }, activeSheet)).replace(/\d+$/u, ''),
      }),
    )
    const rows: SpreadsheetGridRow[] = Array.from(
      { length: activeSheet.rowCount },
      (_, row) => ({
        cells: columns.map(({ index: column }) => {
          const address = Effect.runSync(spreadsheetAddress({ column, row }, activeSheet))
          return {
            address,
            cell: Effect.runSync(readSpreadsheetCell(activeSheet, address)),
            column,
          }
        }),
        index: row,
      }),
    )
    return { columns, rows }
  }, [activeSheet])

  return (
    <section {...stylex.props(styles.root)} aria-label={workbook.title}>
      <div {...stylex.props(styles.gridScroller)}>
        <div {...stylex.props(styles.grid)} style={gridStyle} role="grid" aria-readonly={!editable}>
          <div {...stylex.props(styles.cornerCell)} role="columnheader" />
          {columns.map(column => (
            <div key={column.label} {...stylex.props(styles.columnHeader)} role="columnheader">
              {column.label}
            </div>
          ))}
          {rows.map(row => (
            <div key={row.index} style={{ display: 'contents' }} role="row">
              <div {...stylex.props(styles.rowHeader)} role="rowheader">{row.index + 1}</div>
              {row.cells.map(({ address, cell, column }) => {
                const selected = address === selectedAddress
                const editing = selected && cellEditing
                return (
                  <div
                    key={address}
                    {...stylex.props(styles.cell, selected && styles.cellSelected, cellKindStyle(cell.kind))}
                    aria-colindex={column + 1}
                    aria-rowindex={row.index + 1}
                    role="gridcell"
                    tabIndex={selected ? 0 : -1}
                    onDoubleClick={() => {
                      if (editable) {
                        replaceEdit({
                          address,
                          sheetId: activeSheet.id,
                          source: 'cell',
                          value: cell.input,
                        })
                      }
                    }}
                    onFocus={(event) => {
                      if (event.currentTarget === event.target)
                        selectCell(row.index, column)
                    }}
                    onMouseDown={(event) => {
                      if (event.currentTarget === event.target)
                        selectCell(row.index, column)
                    }}
                  >
                    {editing
                      ? (
                          <input
                            {...stylex.props(styles.cellEditor)}
                            aria-label={`${strings.cellName} ${address}`}
                            autoFocus
                            value={draft}
                            onBlur={handleEditBlur}
                            onChange={(event) => {
                              const current = editRef.current
                              if (current)
                                replaceEdit({ ...current, value: event.target.value })
                            }}
                            onKeyDown={handleEditKeyDown}
                          />
                        )
                      : cell.display}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <header {...stylex.props(styles.topControlLayer)}>
        <div {...stylex.props(styles.toolbarIsland, styles.glassMaterial)} aria-label="Spreadsheet formatting" role="toolbar">
          <div {...stylex.props(styles.toolbarGroup)}>
            <ToolbarButton command="undo" disabled={!editable} icon={Undo2} label={strings.undo} onCommand={onToolbarCommand} />
            <ToolbarButton command="redo" disabled={!editable} icon={Redo2} label={strings.redo} onCommand={onToolbarCommand} />
          </div>
          <span {...stylex.props(styles.toolbarDivider)} />
          <button {...stylex.props(styles.menuButton)} disabled={!editable} title={strings.textStyle} type="button">
            <span>Inter</span>
            <ChevronDown aria-hidden="true" size={12} />
          </button>
          <button {...stylex.props(styles.numberButton)} disabled={!editable} aria-label="Font size" type="button">11</button>
          <span {...stylex.props(styles.toolbarDivider, styles.compactToolbarHidden)} />
          <div {...stylex.props(styles.toolbarGroup)}>
            <ToolbarButton command="bold" disabled={!editable} icon={Bold} label={strings.bold} onCommand={onToolbarCommand} pressed />
            <ToolbarButton command="italic" disabled={!editable} icon={Italic} label={strings.italic} onCommand={onToolbarCommand} />
            <ToolbarButton command="underline" disabled={!editable} icon={Underline} label={strings.underline} onCommand={onToolbarCommand} />
          </div>
          <button {...stylex.props(styles.iconButton)} disabled={!editable} title={strings.color} type="button">
            <PaintBucket aria-hidden="true" size={16} />
            <span {...stylex.props(styles.colorSwatch)} />
          </button>
          <span {...stylex.props(styles.toolbarDivider)} />
          <div {...stylex.props(styles.toolbarGroup, styles.wideToolbarGroup)}>
            <ToolbarButton command="align-left" disabled={!editable} icon={AlignLeft} label={strings.alignLeft} onCommand={onToolbarCommand} pressed />
            <ToolbarButton command="align-center" disabled={!editable} icon={AlignCenter} label={strings.alignCenter} onCommand={onToolbarCommand} />
            <ToolbarButton command="align-right" disabled={!editable} icon={AlignRight} label={strings.alignRight} onCommand={onToolbarCommand} />
          </div>
          <span {...stylex.props(styles.toolbarDivider, styles.wideToolbarGroup)} />
          <div {...stylex.props(styles.toolbarGroup, styles.wideToolbarGroup)}>
            <button {...stylex.props(styles.iconButton)} disabled={!editable} title={strings.currency} type="button"><CircleDollarSign aria-hidden="true" size={16} /></button>
            <button {...stylex.props(styles.iconButton)} disabled={!editable} title={strings.percent} type="button"><Percent aria-hidden="true" size={16} /></button>
          </div>
          <button {...stylex.props(styles.iconButton, styles.moreButton)} disabled={!editable} title={strings.more} type="button"><MoreHorizontal aria-hidden="true" size={17} /></button>
        </div>

        <div {...stylex.props(styles.formulaIsland, styles.glassMaterial)}>
          <span {...stylex.props(styles.cellAddress)}>{selectedAddress}</span>
          <span {...stylex.props(styles.formulaDivider)} />
          <span {...stylex.props(styles.formulaIcon)} aria-hidden="true">ƒx</span>
          <input
            {...stylex.props(styles.formulaInput)}
            aria-label={strings.formula}
            disabled={!editable}
            value={draft}
            onBlur={handleEditBlur}
            onChange={event => replaceEdit({
              address: selectedAddress,
              sheetId: activeSheet.id,
              source: 'formula',
              value: event.target.value,
            })}
            onFocus={() => replaceEdit({
              address: selectedAddress,
              sheetId: activeSheet.id,
              source: 'formula',
              value: selectedCell.input,
            })}
            onKeyDown={handleEditKeyDown}
          />
        </div>
      </header>

      <footer {...stylex.props(styles.bottomControlLayer)}>
        <div {...stylex.props(styles.sheetIsland, styles.glassMaterial)}>
          {onAddSheet
            ? (
                <button {...stylex.props(styles.addSheetButton)} aria-label={strings.addSheet} title={strings.addSheet} type="button" onClick={onAddSheet}>
                  <Plus aria-hidden="true" size={16} strokeWidth={2.2} />
                </button>
              )
            : null}
          <span {...stylex.props(styles.sheetDivider)} />
          <div {...stylex.props(styles.sheetTabs)} role="tablist">
            {workbook.sheets.map(sheet => (
              <button
                key={sheet.id}
                {...stylex.props(styles.sheetTab, sheet.id === activeSheet.id && styles.sheetTabActive)}
                aria-selected={sheet.id === activeSheet.id}
                role="tab"
                type="button"
                onClick={() => onActiveSheetChange(sheet.id)}
              >
                {sheet.name}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </section>
  )
}

export function SpreadsheetWorkspace(props: SpreadsheetWorkspaceProps) {
  const workbook = useMemo(
    () => Effect.runSync(validateSpreadsheetWorkbook(props.workbook)),
    [props.workbook],
  )
  const lock = useMemo(
    () => Effect.runSync(validateSpreadsheetLock(props.lock)),
    [props.lock],
  )
  const activeSheet = useMemo(
    () => Effect.runSync(resolveSpreadsheetSheet(workbook, props.activeSheetId)),
    [props.activeSheetId, workbook],
  )
  const editSession = lock.state === 'owned' && props.onCellCommit !== undefined ? 'editable' : 'readonly'

  return (
    <SpreadsheetWorkspaceContent
      {...props}
      key={`${activeSheet.id}:${activeSheet.columnCount}:${activeSheet.rowCount}:${editSession}`}
      activeSheet={activeSheet}
      lock={lock}
      workbook={workbook}
    />
  )
}
