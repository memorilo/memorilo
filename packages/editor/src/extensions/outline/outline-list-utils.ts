import type { NodeType, Node as ProseMirrorNode, ResolvedPos, Schema } from '@tiptap/pm/model'
import { isListContainerNode } from './outline-utils'

export function findParentListType($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (isListContainerNode(node))
      return node.type
  }
  return null
}

export function stripCheckedAttr(attrs: Record<string, any>) {
  const nextAttrs = { ...attrs }
  if ('checked' in nextAttrs) {
    delete nextAttrs.checked
  }
  return nextAttrs
}

export function resolveDefaultItemTypeForList(schema: Schema, listType: NodeType) {
  const {
    orderedList: orderedListType,
    orderedItem: orderedItemType,
    taskList: taskListType,
    taskItem: taskItemType,
    bulletList: bulletListType,
    listItem: listItemType,
  } = schema.nodes

  if (!listItemType || !orderedItemType) {
    return null
  }

  if (orderedListType && listType === orderedListType) {
    return orderedItemType
  }

  if (taskListType && listType === taskListType) {
    return taskItemType ?? listItemType
  }

  if (bulletListType && listType === bulletListType) {
    return listItemType
  }

  return listItemType
}

export function resolveItemTypeForList(
  schema: Schema,
  listType: NodeType,
  sourceItemType: NodeType,
) {
  // Preserve task items in mixed lists while enforcing ordered list item types.
  const {
    orderedList: orderedListType,
    orderedItem: orderedItemType,
    taskList: taskListType,
    taskItem: taskItemType,
    bulletList: bulletListType,
    listItem: listItemType,
  } = schema.nodes

  if (!listItemType || !orderedItemType) {
    return null
  }

  if (orderedListType && listType === orderedListType) {
    return orderedItemType
  }

  const isTaskList = taskListType && listType === taskListType
  const isBulletList = bulletListType && listType === bulletListType
  if (isTaskList || isBulletList) {
    if (taskItemType && sourceItemType === taskItemType) {
      return taskItemType
    }
    return listItemType
  }

  return sourceItemType
}

export function normalizeItemForList(
  schema: Schema,
  listType: NodeType | null,
  item: ProseMirrorNode,
) {
  if (!listType) {
    return item
  }

  const targetType = resolveItemTypeForList(schema, listType, item.type)
  if (!targetType || targetType === item.type) {
    return item
  }

  // Drop task-only attrs when converting to non-task item types.
  const nextAttrs = targetType.name === 'taskItem' ? item.attrs : stripCheckedAttr(item.attrs)
  return targetType.create(nextAttrs, item.content, item.marks)
}
