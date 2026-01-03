import type { MemoriloEditor } from '../slate'
import { withTable as slateWithTable } from 'slate-table'
import { TABLE_BLOCKS } from '../components/elements/table/type'

export function withTable(editor: MemoriloEditor): MemoriloEditor {
  return slateWithTable(editor, {
    blocks: TABLE_BLOCKS,
  })
}
