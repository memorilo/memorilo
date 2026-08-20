import type { TopicBlockEdit } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'
import { reconcileTodoParentStatuses } from './todo-parent-status'

type Status = 'todo' | 'doing' | 'done'

interface NodeJSON {
  attrs: Record<string, unknown>
  content: NodeJSON[]
  type: string
}

function task(id: string, status: Status, children: NodeJSON[] = []): NodeJSON {
  return {
    attrs: { blockId: id, kind: 'task', status },
    content: children,
    type: 'list',
  }
}

function nonTodo(id: string, children: NodeJSON[] = []): NodeJSON {
  return {
    attrs: { blockId: id, kind: 'outline' },
    content: children,
    type: 'list',
  }
}

function edits(document: NodeJSON): readonly TopicBlockEdit[] {
  return reconcileTodoParentStatuses({ content: [document], type: 'doc' })
}

describe('todo parent status reconciliation', () => {
  it('completes a parent when all direct Todo children are done', () => {
    expect(edits(task('parent', 'todo', [task('first', 'done'), task('second', 'done')]))).toMatchObject([
      {
        attributes: { checked: true, status: 'done' },
        blockId: 'parent',
        operation: 'update-block-attributes',
      },
    ])
  })

  it('reopens a completed parent when a direct Todo child is reopened', () => {
    expect(edits(task('parent', 'done', [task('child', 'todo')]))).toMatchObject([
      {
        attributes: { checked: false, status: 'todo' },
        blockId: 'parent',
        operation: 'update-block-attributes',
      },
    ])
  })

  it('reconciles nested Todo parents from the leaves upward', () => {
    expect(edits(task('root', 'todo', [task('middle', 'todo', [task('leaf', 'done')])]))).toMatchObject([
      { attributes: { status: 'done' }, blockId: 'middle' },
      { attributes: { status: 'done' }, blockId: 'root' },
    ])
  })

  it('ignores Todo descendants behind a non-Todo block', () => {
    expect(edits(task('parent', 'todo', [nonTodo('outline', [task('nested', 'done')])]))).toEqual([])
  })

  it('does not change a parent when direct Todo children are mixed', () => {
    expect(edits(task('parent', 'doing', [task('done-child', 'done'), task('open-child', 'doing')]))).toEqual([])
  })
})
