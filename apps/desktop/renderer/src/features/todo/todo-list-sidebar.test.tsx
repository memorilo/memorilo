import type { TFunction } from 'i18next'
import type { TodoListSummary } from './todo-model'
import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodoListSidebar } from './todo-list-sidebar'

const labels: Record<string, string> = {
  sidebarAll: 'All',
  sidebarLabel: 'Todo navigation',
  sidebarNext7: 'Next 7 Days',
  sidebarNoNotes: 'No Notes with tasks',
  sidebarNotes: 'Notes',
  sidebarOverdue: 'Overdue',
  sidebarSmartViews: 'Views',
  sidebarStatus: 'Status',
  sidebarToday: 'Today',
  sidebarTomorrow: 'Tomorrow',
  sidebarUndated: 'No Date',
  statusDoing: 'Doing',
  statusDone: 'Done',
  statusTodo: 'Todo',
}

const t = ((key: string) => labels[key] ?? key) as unknown as TFunction

function summary(overrides: Partial<TodoListSummary> = {}): TodoListSummary {
  return {
    counts: {
      all: 7,
      doing: 2,
      done: 1,
      next7: 3,
      overdue: 1,
      today: 1,
      todo: 4,
      tomorrow: 1,
      undated: 1,
    },
    notes: [
      { count: 2, favorite: false, noteId: 'note-z', title: 'Zeta' },
      { count: 1, favorite: true, noteId: 'note-b', title: 'Beta' },
      { count: 3, favorite: true, noteId: 'note-a', title: 'Alpha' },
    ],
    ...overrides,
  }
}

describe('todoListSidebar', () => {
  it('renders sections, counts, ordering, selection, and selection callbacks', () => {
    const onSelectionChange = vi.fn()
    const rendered = render(
      <TodoListSidebar
        locale="en-US"
        onSelectionChange={onSelectionChange}
        selection={{ id: 'today', kind: 'scope' }}
        summary={summary()}
        t={t}
      />,
    )

    expect(rendered.getByRole('navigation', { name: 'Todo navigation' })).toBeInTheDocument()
    expect(rendered.getByRole('heading', { name: 'Views' })).toBeInTheDocument()
    expect(rendered.getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-expanded', 'true')
    expect(rendered.getByRole('heading', { name: 'Status' })).toBeInTheDocument()
    expect(rendered.getByRole('button', { name: /^Today/ })).toHaveAttribute('aria-current', 'page')
    expect(rendered.getByRole('button', { name: /^Today/ })).toHaveTextContent('1')

    const notesSection = rendered.getByRole('button', { name: 'Notes' }).closest('section')
    expect(notesSection).not.toBeNull()
    expect(within(notesSection!).getAllByRole('button').map(button => button.getAttribute('title')).filter(Boolean)).toEqual(['Alpha', 'Beta', 'Zeta'])

    fireEvent.click(rendered.getByRole('button', { name: /^Overdue/ }))
    fireEvent.click(rendered.getByRole('button', { name: /^Alpha/ }))
    expect(onSelectionChange).toHaveBeenNthCalledWith(1, { id: 'overdue', kind: 'scope' })
    expect(onSelectionChange).toHaveBeenNthCalledWith(2, { kind: 'note', noteId: 'note-a' })
  })

  it('collapses and expands Notes, and shows the empty state', () => {
    const rendered = render(
      <TodoListSidebar
        locale="en-US"
        onSelectionChange={vi.fn()}
        selection={{ id: 'all', kind: 'scope' }}
        summary={summary({ notes: [] })}
        t={t}
      />,
    )
    const notesToggle = rendered.getByRole('button', { name: 'Notes' })
    expect(rendered.getByText('No Notes with tasks')).toBeInTheDocument()

    fireEvent.click(notesToggle)
    expect(notesToggle).toHaveAttribute('aria-expanded', 'false')
    expect(rendered.queryByText('No Notes with tasks')).not.toBeInTheDocument()

    fireEvent.click(notesToggle)
    expect(notesToggle).toHaveAttribute('aria-expanded', 'true')
    expect(rendered.getByText('No Notes with tasks')).toBeInTheDocument()
  })
})
