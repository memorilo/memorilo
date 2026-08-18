import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../../adapters/editor-adapters'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { page } from '@vitest/browser/context'
import { isApple } from 'prosekit/core'
import { describe, expect, it, vi } from 'vitest'
import { EditorTestHarness as Editor } from '../../../test/browser/editor-test-harness'
import { userEvent } from '../../../test/browser/user-event'

function recurringTask(blockId: string): NodeJSON {
  return {
    attrs: {
      blockId,
      checked: false,
      collapsed: false,
      dueDate: '2026-08-18',
      elapsedMs: 100,
      kind: 'task',
      order: null,
      repeatRule: { interval: 1, mode: 'due', unit: 'day' },
      startedAt: 1,
      status: 'doing',
    },
    content: [{ content: [{ text: 'Recurring task', type: 'text' }], type: 'paragraph' }],
    type: 'list',
  }
}

function editorAdapters(
  completeRecurring: (input: { blockId: string }) => Promise<void>,
): EditorAdapters {
  return {
    tagStorage: {
      create: async tag => tag,
      search: async () => [],
      update: async tag => tag,
    },
    taskActions: { completeRecurring },
    uploadImage: async () => 'memory://image',
  }
}

function renderRecurringTask(completeRecurring: (input: { blockId: string }) => Promise<void>) {
  return render(
    <Editor
      adapters={editorAdapters(completeRecurring)}
      initialContent={{ content: [recurringTask('recurring-task')], type: 'doc' }}
      taskDate="2026-08-18"
    />,
  )
}

describe('recurring task completion entry points', () => {
  it('uses the recurring completion adapter from the task status button', async () => {
    const completeRecurring = vi.fn(async () => undefined)
    const rendered = renderRecurringTask(completeRecurring)
    await rendered.findByText('Recurring task')
    const status = rendered.container.querySelector<HTMLButtonElement>('button[data-status="doing"]')
    if (!status)
      throw new Error('Recurring task status button was not rendered')

    fireEvent.click(status)

    await waitFor(() => expect(completeRecurring).toHaveBeenCalledWith({ blockId: 'recurring-task' }))
    expect(completeRecurring).toHaveBeenCalledOnce()
  })

  it('uses the recurring completion adapter from Cmd/Ctrl+Enter', async () => {
    const completeRecurring = vi.fn(async () => undefined)
    const rendered = renderRecurringTask(completeRecurring)
    await rendered.findByText('Recurring task')

    await userEvent.click(page.getByText('Recurring task', { exact: true }))
    fireEvent.keyDown(rendered.getByRole('textbox', { name: 'Editor content' }), {
      ctrlKey: !isApple,
      key: 'Enter',
      metaKey: isApple,
    })

    await waitFor(() => expect(completeRecurring).toHaveBeenCalledWith({ blockId: 'recurring-task' }))
    expect(completeRecurring).toHaveBeenCalledOnce()
  })

  it('uses the recurring completion adapter from the task status context menu', async () => {
    const completeRecurring = vi.fn(async () => undefined)
    const rendered = renderRecurringTask(completeRecurring)
    await rendered.findByText('Recurring task')

    const status = rendered.container.querySelector<HTMLButtonElement>('button[data-status="doing"]')
    if (!status)
      throw new Error('Recurring task status button was not rendered')
    fireEvent.contextMenu(status)
    fireEvent.click(await rendered.findByRole('button', { name: 'Complete and schedule next' }))

    await waitFor(() => expect(completeRecurring).toHaveBeenCalledWith({ blockId: 'recurring-task' }))
    expect(completeRecurring).toHaveBeenCalledOnce()
  })
})
