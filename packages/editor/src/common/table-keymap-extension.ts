import type { Command } from 'prosekit/pm/state'
import { defineKeymap, Priority, withPriority } from 'prosekit/core'
import { goToNextCell, isInTable } from 'prosemirror-tables'

function createTableCellNavigationCommand(direction: -1 | 1): Command {
  const navigate = goToNextCell(direction)

  return (state, dispatch, view) => {
    if (!isInTable(state))
      return false

    navigate(state, dispatch, view)
    return true
  }
}

export function defineTableKeymapExtension() {
  return withPriority(defineKeymap({
    'Tab': createTableCellNavigationCommand(1),
    'Shift-Tab': createTableCellNavigationCommand(-1),
  }), Priority.highest)
}
