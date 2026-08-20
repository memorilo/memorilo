import type { Extension } from 'prosekit/core'
import type { Attrs } from 'prosekit/pm/model'
import type { Command } from 'prosekit/pm/state'
import type { ListAttributes } from 'prosemirror-flat-list'
import type { EditorTaskActionAdapter } from '../../adapters/editor-adapters'
import type { TaskHistory, TaskTimingAttrs } from './task-status'
import { defineCommands, defineKeymap, defineNodeView, union } from 'prosekit/core'
import { createToggleListCommand, createUnwrapListCommand } from 'prosemirror-flat-list'

import { defineTaskAttrs, parseTaskHistory, parseTaskRepeatRule } from '../../schema/task-schema'
import { createTaskListView } from './task-list-view.tsx'
import { createTaskSplitCommand, EMPTY_TASK_ATTRS } from './task-split'
import { effectiveStatus, pauseTask, resumeTask, transitionAttrs } from './task-status'

function taskAttrsAtSelection(state: Parameters<Command>[0]): TaskTimingAttrs {
  const { $from } = state.selection

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === 'list') {
      if (node.attrs.status === 'todo' || node.attrs.status === 'doing' || node.attrs.status === 'done')
        return resumeTask(pauseTask(node.attrs))
      continue
    }

    const history = parseTaskHistory(node.attrs.taskHistory)
    if (history)
      return resumeTask(history)
  }

  return EMPTY_TASK_ATTRS
}

function preserveTaskHistory(tr: Parameters<NonNullable<Parameters<Command>[1]>>[0], contentPos: number, history: TaskHistory) {
  const mappedPos = tr.mapping.map(contentPos)
  const contentNode = tr.doc.nodeAt(mappedPos)
  if (!contentNode || contentNode.type.name !== 'paragraph')
    throw new Error('A task list must unwrap to a paragraph before preserving its timing')

  const attrs: Attrs = { ...contentNode.attrs, taskHistory: history }
  tr.setNodeMarkup(mappedPos, undefined, attrs)
}

function createTaskToggleCommand(): Command {
  return (state, dispatch, view) => {
    const { $from } = state.selection

    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name !== 'list' || node.attrs.kind !== 'task')
        continue

      const unwrap = createUnwrapListCommand({ kind: 'task' })
      if (!dispatch)
        return unwrap(state, undefined, view)

      const contentPos = $from.before(depth) + 1
      const history = pauseTask(node.attrs)
      return unwrap(state, (tr) => {
        preserveTaskHistory(tr, contentPos, history)
        dispatch(tr)
      }, view)
    }

    return createToggleListCommand({ kind: 'task', ...taskAttrsAtSelection(state) } as ListAttributes)(state, dispatch, view)
  }
}

function createTaskCycleWrapCommand(): Command {
  return (state, dispatch, view) => {
    const timing = taskAttrsAtSelection(state)
    return createToggleListCommand({
      kind: 'task',
      status: 'todo',
      elapsedMs: timing.elapsedMs,
      startedAt: null,
      checked: false,
    } as ListAttributes)(state, dispatch, view)
  }
}

function createTaskAwareToggleListCommand(attrs: ListAttributes = {}): Command {
  if (attrs.kind === 'task')
    return createTaskToggleCommand()
  return createToggleListCommand(attrs)
}

/**
 * Cmd/Ctrl+Enter cycles the current block:
 * normal → task(todo) → task(doing) → task(done) → normal.
 *
 * Timing settles on every hop (see {@link transitionAttrs}).
 */
function createCycleTaskCommand(taskActions?: EditorTaskActionAdapter): Command {
  return (state, dispatch, view) => {
    const { $from } = state.selection

    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth)
      if (node.type.name !== 'list')
        continue

      if (node.attrs.kind !== 'task') {
        // A non-task list becomes a task in the `todo` state.
        return createTaskCycleWrapCommand()(state, dispatch, view)
      }

      const status = effectiveStatus(node.attrs)
      const repeatRule = parseTaskRepeatRule(node.attrs.repeatRule)
      const blockId = node.attrs.blockId
      if (status !== 'todo' && repeatRule !== null && taskActions) {
        if (typeof blockId !== 'string' || blockId.length === 0)
          throw new Error('Recurring task completion requires a Block id')
        if (dispatch) {
          void taskActions.completeRecurring({ blockId }).catch((error) => {
            console.error(`Failed to complete recurring task ${blockId}`, error)
          })
        }
        return true
      }
      if (status === 'done') {
        // Completed task cycles back to a plain block.
        return createTaskToggleCommand()(state, dispatch, view)
      }

      const next = status === 'todo' ? 'doing' : 'done'
      if (dispatch) {
        const pos = $from.before(depth)
        const attrs = transitionAttrs(node.attrs, next)
        dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }))
      }
      return true
    }

    // Not in a list: wrap the current block into a `todo` task.
    return createTaskCycleWrapCommand()(state, dispatch, view)
  }
}

export function defineTaskListView(taskActions?: EditorTaskActionAdapter): Extension {
  return union(
    defineTaskAttrs(),
    defineCommands({
      toggleList: createTaskAwareToggleListCommand,
    }),
    defineNodeView({
      name: 'list',
      constructor: createTaskListView(taskActions),
    }),
    defineKeymap({
      'Enter': createTaskSplitCommand(),
      'Mod-Enter': createCycleTaskCommand(taskActions),
    }),
  )
}
