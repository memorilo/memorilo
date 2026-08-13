import type {
  SpreadsheetCollaborator,
  SpreadsheetLock,
  SpreadsheetWorkbook,
} from './spreadsheet-model'

export type {
  SpreadsheetCell,
  SpreadsheetCellKind,
  SpreadsheetCellUpdate,
  SpreadsheetCollaborator,
  SpreadsheetLock,
  SpreadsheetModelError,
  SpreadsheetSelection,
  SpreadsheetSheet,
  SpreadsheetWorkbook,
} from './spreadsheet-model'

export type SpreadsheetToolbarCommand
  = | 'align-center'
    | 'align-left'
    | 'align-right'
    | 'bold'
    | 'italic'
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
  readonly collaborators?: readonly SpreadsheetCollaborator[]
  readonly lock: SpreadsheetLock
  readonly onActiveSheetChange: (sheetId: string) => void
  readonly onAddSheet?: () => void
  readonly onCellCommit?: (sheetId: string, address: string, input: string) => void
  readonly onLockRelease: () => void
  readonly onLockRequest: () => void
  readonly onToolbarCommand?: (command: SpreadsheetToolbarCommand) => void
  readonly strings: SpreadsheetStrings
  readonly workbook: SpreadsheetWorkbook
}
