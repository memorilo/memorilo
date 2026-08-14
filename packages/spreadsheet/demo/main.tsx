import type {
  SpreadsheetCell,
  SpreadsheetCellKind,
  SpreadsheetCollaborator,
  SpreadsheetLock,
  SpreadsheetSheet,
  SpreadsheetStrings,
  SpreadsheetWorkbook,
} from '../src'
import * as stylex from '@stylexjs/stylex'
import { Effect } from 'effect'
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  bindSpreadsheetCellInput,
  evaluateSpreadsheetWorkbooks,
  parseSpreadsheetAddress,
  spreadsheetCellKey,
  SpreadsheetWorkspace,
} from '../src'
import { demoStyles } from './main.stylex'
import './global.css'

const demoTopicId = 'demo-topic'

const alex: SpreadsheetCollaborator = {
  color: 'rgb(203, 77, 90)',
  id: 'alex',
  initials: 'AM',
  name: 'Alex Morgan',
}

const mei: SpreadsheetCollaborator = {
  color: 'rgb(47, 126, 204)',
  id: 'mei',
  initials: 'ML',
  name: 'Mei Lin',
}

const strings: SpreadsheetStrings = {
  addSheet: 'Add sheet',
  alignCenter: 'Align center',
  alignLeft: 'Align left',
  alignRight: 'Align right',
  bold: 'Bold',
  cellName: 'Cell',
  color: 'Fill color',
  currency: 'Currency',
  formula: 'Formula',
  italic: 'Italic',
  lockAcquiring: 'Requesting edit access',
  lockAvailable: 'Available to edit',
  lockHeldBy: name => `${name} is editing`,
  lockOwned: 'You are editing',
  more: 'More formatting',
  percent: 'Percent',
  redo: 'Redo',
  releaseEdit: 'Release edit access',
  requestEdit: 'Request edit access',
  textStyle: 'Font family',
  underline: 'Underline',
  undo: 'Undo',
}

interface DemoCell {
  readonly input: string
  readonly kind?: SpreadsheetCellKind
}

function createDemoSheet(
  id: string,
  name: string,
  sourceCells: Readonly<Record<string, DemoCell>>,
): SpreadsheetSheet {
  const rows = Array.from({ length: 24 }, (_, index) => ({ id: `${id}:row:${index + 1}` }))
  const columns = Array.from({ length: 12 }, (_, index) => ({ id: `${id}:column:${index + 1}` }))
  const dimensions = { columns, id, rows }
  const cells = Object.fromEntries(Object.entries(sourceCells).map(([address, source]) => {
    const selection = Effect.runSync(parseSpreadsheetAddress(address, dimensions))
    const cell: SpreadsheetCell = {
      format: source.kind === undefined ? {} : { kind: source.kind },
      formulaReferences: [],
      input: source.input,
    }
    return [spreadsheetCellKey(rows[selection.row]!.id, columns[selection.column]!.id), cell]
  }))
  return { cells, columns, id, name, rows }
}

const initialWorkbook: SpreadsheetWorkbook = {
  sheets: [
    createDemoSheet('overview', 'Overview', {
      A1: { input: 'Q3 launch plan' },
      A2: { input: 'Workstream' },
      A3: { input: 'Brand campaign' },
      A4: { input: 'Partner events' },
      A5: { input: 'Product video' },
      A7: { input: 'Quarter summary' },
      A8: { input: 'Budget used' },
      A9: { input: 'Remaining' },
      B2: { input: 'Budget' },
      B3: { input: '42000', kind: 'currency' },
      B4: { input: '28000', kind: 'currency' },
      B5: { input: '=SUM(B3:B4)', kind: 'currency' },
      B8: { input: '=C5/B5', kind: 'percent' },
      B9: { input: '=D5', kind: 'currency' },
      C2: { input: 'Spent' },
      C3: { input: '31840', kind: 'currency' },
      C4: { input: '24110', kind: 'currency' },
      C5: { input: '=SUM(C3:C4)', kind: 'currency' },
      D2: { input: 'Variance' },
      D3: { input: '=B3-C3', kind: 'currency' },
      D4: { input: '=B4-C4', kind: 'currency' },
      D5: { input: '=SUM(D3:D4)', kind: 'currency' },
      E2: { input: 'Owner' },
      E3: { input: 'Alex Morgan' },
      E4: { input: 'Mei Lin' },
      E5: { input: 'Sam Kim' },
      F2: { input: 'Status' },
      F3: { input: 'On track' },
      F4: { input: 'At risk' },
      F5: { input: 'On track' },
    }),
    createDemoSheet('campaigns', 'Campaigns', {
      A1: { input: 'Campaign' },
      A2: { input: 'Launch film' },
      B1: { input: 'Channel' },
      B2: { input: 'Video' },
      C1: { input: 'Spend' },
      C2: { input: '18500', kind: 'currency' },
      D1: { input: 'Conversion' },
      D2: { input: '0.064', kind: 'percent' },
    }),
    createDemoSheet('vendors', 'Vendors', {
      A1: { input: 'Vendor' },
      A2: { input: 'Northstar Studio' },
      B1: { input: 'Commitment' },
      B2: { input: '24000', kind: 'currency' },
      C1: { input: 'Paid' },
      C2: { input: '18000', kind: 'currency' },
    }),
  ],
}

export function Demo() {
  const [activeSheetId, setActiveSheetId] = useState('overview')
  const [lock, setLock] = useState<SpreadsheetLock>({ owner: alex, state: 'locked' })
  const [workbook, setWorkbook] = useState(initialWorkbook)
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projection = useMemo(() => {
    const projected = evaluateSpreadsheetWorkbooks([{
      title: 'Q3 Launch Budget',
      topicId: demoTopicId,
      workbook,
    }]).get(demoTopicId)
    if (!projected)
      throw new Error('Missing demo Workbook projection')
    return projected
  }, [workbook])

  useEffect(() => () => {
    if (lockTimer.current)
      clearTimeout(lockTimer.current)
  }, [])

  const requestLock = () => {
    if (lock.state === 'owned' || lock.state === 'acquiring')
      return
    setLock({ state: 'acquiring' })
    lockTimer.current = setTimeout(() => {
      setLock({ owner: mei, state: 'owned' })
      lockTimer.current = null
    }, 900)
  }

  const releaseLock = () => {
    if (lock.state !== 'owned')
      return
    setLock({ state: 'available' })
  }

  return (
    <main {...stylex.props(demoStyles.page)}>
      <div {...stylex.props(demoStyles.workspaceFrame)}>
        <SpreadsheetWorkspace
          activeSheetId={activeSheetId}
          ariaLabel="Q3 Launch Budget"
          lock={lock}
          strings={strings}
          workbook={projection}
          onActiveSheetChange={setActiveSheetId}
          onCellCommit={(sheetId, rowId, columnId, input) => {
            setWorkbook((current) => {
              const sheet = current.sheets.find(candidate => candidate.id === sheetId)
              if (!sheet)
                throw new Error(`Missing demo Sheet ${sheetId}`)
              const key = spreadsheetCellKey(rowId, columnId)
              const previous = sheet.cells[key]
              const bound = bindSpreadsheetCellInput(input, {
                currentSheetId: sheetId,
                currentTopicId: demoTopicId,
                topics: [{ title: 'Q3 Launch Budget', topicId: demoTopicId, workbook: current }],
              })
              return {
                sheets: current.sheets.map(candidate => candidate.id === sheetId
                  ? {
                      ...candidate,
                      cells: {
                        ...candidate.cells,
                        [key]: {
                          format: previous?.format ?? {},
                          ...bound,
                        },
                      },
                    }
                  : candidate),
              }
            })
          }}
          onLockRelease={releaseLock}
          onLockRequest={requestLock}
        />
      </div>
    </main>
  )
}

const rootElement = document.querySelector('#root')
if (!rootElement)
  throw new Error('Missing spreadsheet demo root element')

createRoot(rootElement).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)
