import type {
  SpreadsheetCell,
  SpreadsheetCollaborator,
  SpreadsheetLock,
  SpreadsheetStrings,
  SpreadsheetWorkbook,
} from '../src'
import * as stylex from '@stylexjs/stylex'
import { Effect } from 'effect'
import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SpreadsheetWorkspace, updateSpreadsheetCell } from '../src'
import { demoStyles } from './main.stylex'
import './global.css'

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

function cell(input: string, display = input, kind: SpreadsheetCell['kind'] = 'text'): SpreadsheetCell {
  return { display, input, kind }
}

const initialWorkbook: SpreadsheetWorkbook = {
  title: 'Q3 Launch Budget',
  sheets: [
    {
      id: 'overview',
      name: 'Overview',
      columnCount: 12,
      rowCount: 24,
      cells: {
        A1: cell('Q3 launch plan'),
        A2: cell('Workstream'),
        B2: cell('Budget'),
        C2: cell('Spent'),
        D2: cell('Variance'),
        E2: cell('Owner'),
        F2: cell('Status'),
        A3: cell('Brand campaign'),
        B3: cell('42000', '$42,000', 'currency'),
        C3: cell('31840', '$31,840', 'currency'),
        D3: cell('=B3-C3', '$10,160', 'currency'),
        E3: cell('Alex Morgan'),
        F3: cell('On track'),
        A4: cell('Partner events'),
        B4: cell('28000', '$28,000', 'currency'),
        C4: cell('24110', '$24,110', 'currency'),
        D4: cell('=B4-C4', '$3,890', 'currency'),
        E4: cell('Mei Lin'),
        F4: cell('At risk'),
        A5: cell('Product video'),
        B5: cell('=SUM(B3:B4)', '$70,000', 'currency'),
        C5: cell('=SUM(C3:C4)', '$55,950', 'currency'),
        D5: cell('=SUM(D3:D4)', '$14,050', 'currency'),
        E5: cell('Sam Kim'),
        F5: cell('On track'),
        A7: cell('Quarter summary'),
        A8: cell('Budget used'),
        B8: cell('=C5/B5', '79.9%', 'percent'),
        A9: cell('Remaining'),
        B9: cell('=D5', '$14,050', 'currency'),
      },
    },
    {
      id: 'campaigns',
      name: 'Campaigns',
      columnCount: 12,
      rowCount: 24,
      cells: {
        A1: cell('Campaign'),
        B1: cell('Channel'),
        C1: cell('Spend'),
        D1: cell('Conversion'),
        A2: cell('Launch film'),
        B2: cell('Video'),
        C2: cell('18500', '$18,500', 'currency'),
        D2: cell('0.064', '6.4%', 'percent'),
      },
    },
    {
      id: 'vendors',
      name: 'Vendors',
      columnCount: 12,
      rowCount: 24,
      cells: {
        A1: cell('Vendor'),
        B1: cell('Commitment'),
        C1: cell('Paid'),
        A2: cell('Northstar Studio'),
        B2: cell('24000', '$24,000', 'currency'),
        C2: cell('18000', '$18,000', 'currency'),
      },
    },
  ],
}

export function Demo() {
  const [activeSheetId, setActiveSheetId] = useState('overview')
  const [lock, setLock] = useState<SpreadsheetLock>({ owner: alex, state: 'locked' })
  const [workbook, setWorkbook] = useState(initialWorkbook)
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
          lock={lock}
          strings={strings}
          workbook={workbook}
          onActiveSheetChange={setActiveSheetId}
          onCellCommit={(sheetId, address, input) => {
            setWorkbook(current => Effect.runSync(updateSpreadsheetCell(current, { address, input, sheetId })))
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
