import type { MenuItemConstructorOptions } from 'electron'
import { BrowserWindow, Menu } from 'electron'
import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'

export interface ColumnVisibilityMenuItem {
  canToggle: boolean
  id: string
  label: string
  visible: boolean
}

export interface ShowColumnVisibilityMenuInput {
  anchor: {
    x: number
    y: number
  }
  columns: readonly ColumnVisibilityMenuItem[]
}

export interface ColumnVisibilityMenuSelection {
  columnId: string
}

function validateColumns(columns: readonly ColumnVisibilityMenuItem[]): void {
  if (columns.length === 0)
    throw new TypeError('Column visibility menu requires at least one column')

  const columnIds = new Set<string>()
  for (const column of columns) {
    if (column.id.trim().length === 0)
      throw new TypeError('Column visibility menu item id must not be empty')
    if (column.label.trim().length === 0)
      throw new TypeError(`Column visibility menu item ${column.id} must have a label`)
    if (columnIds.has(column.id))
      throw new TypeError(`Duplicate column visibility menu item id: ${column.id}`)
    columnIds.add(column.id)
  }
}

function validateAnchor(anchor: ShowColumnVisibilityMenuInput['anchor']): void {
  if (!Number.isInteger(anchor.x) || !Number.isInteger(anchor.y))
    throw new TypeError('Column visibility menu anchor coordinates must be integers')
}

export class WindowService extends IpcService {
  static override readonly groupName = 'window'

  @IpcMethod()
  showColumnVisibilityMenu(
    input: ShowColumnVisibilityMenuInput,
  ): Promise<ColumnVisibilityMenuSelection | null> {
    validateAnchor(input.anchor)
    validateColumns(input.columns)
    const browserWindow = BrowserWindow.fromWebContents(getIpcContext().sender)
    if (!browserWindow)
      throw new Error('Cannot show a native menu without an owning BrowserWindow')

    return new Promise((resolve) => {
      let selectedColumnId: string | null = null
      const columnItems: MenuItemConstructorOptions[] = input.columns.map(column => ({
        checked: column.visible,
        click: () => {
          selectedColumnId = column.id
        },
        enabled: column.canToggle,
        label: column.label,
        type: 'checkbox',
      }))
      const menu = Menu.buildFromTemplate([{
        label: 'Columns visibility',
        submenu: columnItems,
      }])
      menu.popup({
        callback: () => resolve(selectedColumnId === null ? null : { columnId: selectedColumnId }),
        window: browserWindow,
        x: input.anchor.x,
        y: input.anchor.y,
      })
    })
  }
}
