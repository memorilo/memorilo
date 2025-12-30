import { useCallback } from 'react'
import { useSlateSelector } from 'slate-react'
import { isTableSelectionActive } from '../lib/table-selection'

export function useTableSelectionActive() {
  return useSlateSelector(useCallback(
    editor => isTableSelectionActive(editor),
    [],
  ))
}
