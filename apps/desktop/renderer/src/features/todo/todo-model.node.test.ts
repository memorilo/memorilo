import { describe, expect, it } from 'vitest'
import { formatTaskDuration, groupTodoTasks, taskElapsedMs } from './todo-model'

describe('todo list timing', () => {
  it('includes the live span only for an in-progress task', () => {
    expect(taskElapsedMs({ elapsedMs: 2_000, startedAt: 10_000, status: 'doing' }, 15_000)).toBe(7_000)
    expect(taskElapsedMs({ elapsedMs: 2_000, startedAt: 10_000, status: 'done' }, 15_000)).toBe(2_000)
  })

  it('formats compact elapsed durations without losing hour minutes', () => {
    expect(formatTaskDuration(20_000)).toBe('<1m')
    expect(formatTaskDuration(12 * 60_000)).toBe('12m')
    expect(formatTaskDuration((2 * 60 + 7) * 60_000)).toBe('2h 7m')
  })

  it('groups board tasks by persisted status without changing order', () => {
    const grouped = groupTodoTasks([
      { blockId: 'done-1', dueDate: null, elapsedMs: 1, journalDate: null, noteFavorite: false, noteId: 'n', noteTitle: 'N', parentId: null, repeatRule: null, startedAt: null, status: 'done', text: 'First', topicId: 't', topicTitle: 'T' },
      { blockId: 'todo-1', dueDate: null, elapsedMs: 2, journalDate: null, noteFavorite: false, noteId: 'n', noteTitle: 'N', parentId: null, repeatRule: null, startedAt: null, status: 'todo', text: 'Second', topicId: 't', topicTitle: 'T' },
      { blockId: 'done-2', dueDate: null, elapsedMs: 3, journalDate: null, noteFavorite: false, noteId: 'n', noteTitle: 'N', parentId: null, repeatRule: null, startedAt: null, status: 'done', text: 'Third', topicId: 't', topicTitle: 'T' },
    ])
    expect(grouped.todo.map(task => task.blockId)).toEqual(['todo-1'])
    expect(grouped.doing).toEqual([])
    expect(grouped.done.map(task => task.blockId)).toEqual(['done-1', 'done-2'])
  })
})
