import type {
  SpreadsheetCellProjection,
  SpreadsheetCollaborator,
  SpreadsheetLock,
  SpreadsheetWorkbookProjection,
} from './spreadsheet-model'

export type {
  SpreadsheetCell,
  SpreadsheetCellFormat,
  SpreadsheetCellKind,
  SpreadsheetCellProjection,
  SpreadsheetCellUpdate,
  SpreadsheetCollaborator,
  SpreadsheetColumn,
  SpreadsheetEdit,
  SpreadsheetEditReceipt,
  SpreadsheetFormulaBindingContext,
  SpreadsheetFormulaReference,
  SpreadsheetHorizontalAlignment,
  SpreadsheetLock,
  SpreadsheetModelError,
  SpreadsheetRow,
  SpreadsheetSelection,
  SpreadsheetSheet,
  SpreadsheetSheetProjection,
  SpreadsheetTopicWorkbook,
  SpreadsheetWorkbook,
  SpreadsheetWorkbookProjection,
} from './spreadsheet-model'

export type SpreadsheetToolbarCommand
  = | 'align-center'
    | 'align-left'
    | 'align-right'
    | 'bold'
    | 'currency'
    | 'italic'
    | 'percent'
    | 'redo'
    | 'underline'
    | 'undo'

export interface SpreadsheetStrings {
  readonly addSheet: string
  readonly alignCenter: string
  readonly alignLeft: string
  readonly alignRight: string
  readonly bold: string
  readonly cellName: string
  readonly color: string
  readonly currency: string
  readonly formula: string
  readonly italic: string
  readonly lockAcquiring: string
  readonly lockAvailable: string
  readonly lockHeldBy: (name: string) => string
  readonly lockOwned: string
  readonly more: string
  readonly percent: string
  readonly redo: string
  readonly releaseEdit: string
  readonly requestEdit: string
  readonly textStyle: string
  readonly underline: string
  readonly undo: string
}

export interface SpreadsheetWorkspaceProps {
  readonly activeSheetId: string
  readonly ariaLabel: string
  readonly collaborators?: readonly SpreadsheetCollaborator[]
  readonly enabledToolbarCommands?: readonly SpreadsheetToolbarCommand[]
  readonly lock: SpreadsheetLock
  readonly onActiveSheetChange: (sheetId: string) => void
  readonly onAddSheet?: () => void
  readonly onCellCommit?: (
    sheetId: string,
    rowId: string,
    columnId: string,
    input: string,
  ) => void
  readonly onLockRelease: () => void
  readonly onLockRequest: () => void
  readonly onToolbarCommand?: (
    command: SpreadsheetToolbarCommand,
    target: {
      readonly cell: SpreadsheetCellProjection
      readonly columnId: string
      readonly rowId: string
      readonly sheetId: string
    },
  ) => void
  readonly strings: SpreadsheetStrings
  readonly workbook: SpreadsheetWorkbookProjection
}
