import type { DesktopTodoTask } from '@memorilo/desktop-api'
import { describe, expect, it } from 'vitest'
import { filterTodoListTasks, formatTaskDuration, groupTodoTasks, summarizeTodoListTasks, taskElapsedMs } from './todo-model'

function task(overrides: Partial<DesktopTodoTask> = {}): DesktopTodoTask {
  return {
    allDay: false,
    blockId: 'task',
    dueDate: null,
    dueTime: null,
    endAt: null,
    elapsedMs: 0,
    journalDate: null,
    noteFavorite: false,
    noteId: 'note-a',
    noteTitle: 'Note A',
    parentId: null,
    reminderMinutes: null,
    reminders: null,
    repeatRule: null,
    startAt: null,
    startedAt: null,
    status: 'todo',
    text: 'Task',
    topicId: 'topic',
    topicTitle: 'Topic',
    ...overrides,
  }
}

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
      { allDay: false, blockId: 'done-1', dueDate: null, dueTime: null, endAt: null, elapsedMs: 1, journalDate: null, noteFavorite: false, noteId: 'n', noteTitle: 'N', parentId: null, reminderMinutes: null, reminders: null, repeatRule: null, startAt: null, startedAt: null, status: 'done', text: 'First', topicId: 't', topicTitle: 'T' },
      { allDay: false, blockId: 'todo-1', dueDate: null, dueTime: null, endAt: null, elapsedMs: 2, journalDate: null, noteFavorite: false, noteId: 'n', noteTitle: 'N', parentId: null, reminderMinutes: null, reminders: null, repeatRule: null, startAt: null, startedAt: null, status: 'todo', text: 'Second', topicId: 't', topicTitle: 'T' },
      { allDay: false, blockId: 'done-2', dueDate: null, dueTime: null, endAt: null, elapsedMs: 3, journalDate: null, noteFavorite: false, noteId: 'n', noteTitle: 'N', parentId: null, reminderMinutes: null, reminders: null, repeatRule: null, startAt: null, startedAt: null, status: 'done', text: 'Third', topicId: 't', topicTitle: 'T' },
    ])
    expect(grouped.todo.map(task => task.blockId)).toEqual(['todo-1'])
    expect(grouped.doing).toEqual([])
    expect(grouped.done.map(task => task.blockId)).toEqual(['done-1', 'done-2'])
  })
})

describe('todo list sidebar data', () => {
  const today = '2026-08-20'
  const tasks = [
    task({ blockId: 'today', dueDate: today }),
    task({ blockId: 'tomorrow', dueDate: '2026-08-21', status: 'doing' }),
    task({ blockId: 'overdue', dueDate: '2026-08-19' }),
    task({ blockId: 'next7', dueDate: '2026-08-26', noteId: 'note-b', noteTitle: 'Note B', noteFavorite: true }),
    task({ blockId: 'outside', dueDate: '2026-08-27', noteId: 'note-c', noteTitle: 'Note C' }),
    task({ blockId: 'undated', noteId: 'note-b', noteTitle: 'Note B', noteFavorite: true }),
    task({ blockId: 'completed', dueDate: today, status: 'done', noteId: 'note-c', noteTitle: 'Note C' }),
  ]

  it('filters smart views by planning date and excludes completed tasks', () => {
    expect(filterTodoListTasks(tasks, { id: 'all', kind: 'scope' }, today).map(item => item.blockId)).toEqual([
      'today',
      'tomorrow',
      'overdue',
      'next7',
      'outside',
      'undated',
    ])
    expect(filterTodoListTasks(tasks, { id: 'today', kind: 'scope' }, today).map(item => item.blockId)).toEqual(['today'])
    expect(filterTodoListTasks(tasks, { id: 'tomorrow', kind: 'scope' }, today).map(item => item.blockId)).toEqual(['tomorrow'])
    expect(filterTodoListTasks(tasks, { id: 'overdue', kind: 'scope' }, today).map(item => item.blockId)).toEqual(['overdue'])
    expect(filterTodoListTasks(tasks, { id: 'next7', kind: 'scope' }, today).map(item => item.blockId)).toEqual(['today', 'tomorrow', 'next7'])
    expect(filterTodoListTasks(tasks, { id: 'undated', kind: 'scope' }, today).map(item => item.blockId)).toEqual(['undated'])
  })

  it('filters status views and Note views with their intended completion rules', () => {
    expect(filterTodoListTasks(tasks, { id: 'todo', kind: 'scope' }, today).map(item => item.blockId)).toEqual([
      'today',
      'overdue',
      'next7',
      'outside',
      'undated',
    ])
    expect(filterTodoListTasks(tasks, { id: 'doing', kind: 'scope' }, today).map(item => item.blockId)).toEqual(['tomorrow'])
    expect(filterTodoListTasks(tasks, { id: 'done', kind: 'scope' }, today).map(item => item.blockId)).toEqual(['completed'])
    expect(filterTodoListTasks(tasks, { kind: 'note', noteId: 'note-c' }, today).map(item => item.blockId)).toEqual(['outside'])
  })

  it('summarizes active scopes and groups active tasks by Note', () => {
    const summary = summarizeTodoListTasks(tasks, today)
    expect(summary.counts).toEqual({
      all: 6,
      doing: 1,
      done: 1,
      next7: 3,
      overdue: 1,
      today: 1,
      todo: 5,
      tomorrow: 1,
      undated: 1,
    })
    expect(summary.notes).toEqual([
      { count: 3, favorite: false, noteId: 'note-a', title: 'Note A' },
      { count: 2, favorite: true, noteId: 'note-b', title: 'Note B' },
      { count: 1, favorite: false, noteId: 'note-c', title: 'Note C' },
    ])
  })
})
