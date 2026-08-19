import type { EditorNote, TopicBlockEdit } from '@memorilo/editor/note'
import { transitionTaskAttrs } from '@memorilo/editor/schema'

interface NodeJSON {
  attrs?: Record<string, unknown>
  content?: NodeJSON[]
  type: string
}

interface TaskNode {
  children: TaskNode[]
  id: string
  isTask: boolean
  node: NodeJSON
  status: 'todo' | 'doing' | 'done' | null
}

function taskNode(node: NodeJSON): TaskNode | null {
  if (node.type !== 'list')
    throw new TypeError(`Expected a list block, received ${node.type}`)
  const id = node.attrs?.blockId
  if (typeof id !== 'string' || id.length === 0)
    throw new TypeError('Todo blocks require a stable blockId')
  const kind = node.attrs?.kind
  const status = node.attrs?.status
  const children = (node.content ?? [])
    .filter(child => child.type === 'list')
    .map(child => taskNode(child))
  if (kind !== 'task') {
    return {
      children: children.flatMap(child => child === null ? [] : [child]),
      id,
      isTask: false,
      node,
      status: null,
    }
  }
  if (status !== 'todo' && status !== 'doing' && status !== 'done')
    throw new TypeError(`Todo block ${id} has an invalid status`)
  return {
    children: children.flatMap(child => child === null ? [] : [child]),
    id,
    isTask: true,
    node,
    status,
  }
}

/** Returns attribute edits that make each task reflect its direct Todo children. */
export function reconcileTodoParentStatuses(document: NodeJSON): readonly TopicBlockEdit[] {
  if (document.type !== 'doc')
    throw new TypeError(`Expected a doc node, received ${document.type}`)

  const edits: TopicBlockEdit[] = []
  const visit = (node: TaskNode): void => {
    node.children.forEach(visit)
    if (!node.isTask)
      return
    const directTaskChildren = node.children.filter(child => child.isTask)
    if (directTaskChildren.length === 0)
      return
    const nextStatus = directTaskChildren.every(child => child.status === 'done')
      ? 'done'
      : node.status === 'done' ? 'todo' : node.status
    if (nextStatus === node.status || nextStatus === null)
      return
    node.status = nextStatus
    edits.push({
      attributes: {
        ...(node.node.attrs ?? {}),
        ...transitionTaskAttrs(node.node.attrs ?? {}, nextStatus),
      },
      blockId: node.id,
      operation: 'update-block-attributes',
    })
  }

  for (const root of document.content ?? []) {
    const node = taskNode(root)
    if (node)
      visit(node)
  }
  return edits
}

export function reconcileTodoParentStatusesInNote(
  note: Pick<EditorNote, 'applyTopicBlockEdits' | 'getEntries' | 'getTopicValidationInput'>,
  topicIds?: readonly string[],
): boolean {
  const allowedTopicIds = topicIds === undefined ? null : new Set(topicIds)
  let changed = false
  for (const entry of note.getEntries()) {
    if (entry.kind !== 'topic' || (allowedTopicIds !== null && !allowedTopicIds.has(entry.id)))
      continue
    const validation = note.getTopicValidationInput(entry.id)
    if (!('document' in validation))
      continue
    const edits = reconcileTodoParentStatuses(validation.document)
    if (edits.length === 0)
      continue
    note.applyTopicBlockEdits({ edits, topicId: entry.id })
    changed = true
  }
  return changed
}
