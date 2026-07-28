import type { Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { EditorState, Transaction } from 'prosekit/pm/state'
import { TextSelection } from 'prosekit/pm/state'

export interface BlockSiblingTarget {
  node: ProseMirrorNode
  pos: number
}

type DispatchTransaction = (transaction: Transaction) => void

export function insertBlockSiblingAfter(
  state: EditorState,
  dispatch: DispatchTransaction | undefined,
  target: BlockSiblingTarget,
  kind: string,
): boolean {
  if (target.node.type.name !== 'list')
    throw new Error('A wrapped block sibling can only be inserted after a list node')
  if (kind.length === 0)
    throw new Error('A wrapped block sibling requires a non-empty list kind')

  const sibling = target.node.type.createAndFill({ kind })
  if (!sibling)
    throw new Error('Unable to create an empty wrapped block sibling')
  if (!dispatch)
    return true

  const insertPosition = target.pos + target.node.nodeSize
  const transaction = state.tr.insert(insertPosition, sibling)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertPosition + 1), 1))
  dispatch(transaction.scrollIntoView())
  return true
}
