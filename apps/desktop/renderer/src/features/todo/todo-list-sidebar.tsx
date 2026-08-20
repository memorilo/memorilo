import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { TodoListSelection, TodoListSummary } from './todo-model'
import * as stylex from '@stylexjs/stylex'
import {
  CalendarDays,
  CalendarOff,
  CalendarRange,
  CalendarSync,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDotDashed,
  FileText,
  ListTodo,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { todoListSidebarStyles as styles } from './todo-list-sidebar.stylex'
import { todoListSelectionKey } from './todo-model'

interface TodoListSidebarItemProps {
  active: boolean
  count: number
  icon: LucideIcon
  label: string
  onSelect: () => void
}

export function TodoListSidebarItem({ active, count, icon: Icon, label, onSelect }: TodoListSidebarItemProps) {
  return (
    <li>
      <button
        {...stylex.props(styles.item, active && styles.itemActive)}
        aria-current={active ? 'page' : undefined}
        title={label}
        type="button"
        onClick={onSelect}
      >
        <span {...stylex.props(styles.icon, active && styles.iconActive)}>
          <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
        </span>
        <span {...stylex.props(styles.label)}>{label}</span>
        <span {...stylex.props(styles.count, active && styles.countActive)}>{count}</span>
      </button>
    </li>
  )
}

function TodoListSidebarSection({
  children,
  collapsible = false,
  label,
}: {
  children: ReactNode
  collapsible?: boolean
  label: string
}) {
  const [expanded, setExpanded] = useState(true)
  return (
    <section {...stylex.props(styles.section)}>
      {collapsible
        ? (
            <button
              {...stylex.props(styles.sectionHeader, styles.sectionHeaderInteractive)}
              aria-expanded={expanded}
              type="button"
              onClick={() => setExpanded(current => !current)}
            >
              <span>{label}</span>
              <ChevronDown
                {...stylex.props(styles.disclosure, !expanded && styles.disclosureCollapsed)}
                aria-hidden="true"
                strokeWidth={1.8}
              />
            </button>
          )
        : <h3 {...stylex.props(styles.sectionHeader)}>{label}</h3>}
      {expanded ? children : null}
    </section>
  )
}

const smartScopes = [
  { icon: ListTodo, id: 'all', labelKey: 'sidebarAll' },
  { icon: CalendarDays, id: 'today', labelKey: 'sidebarToday' },
  { icon: CalendarSync, id: 'tomorrow', labelKey: 'sidebarTomorrow' },
  { icon: CircleAlert, id: 'overdue', labelKey: 'sidebarOverdue' },
  { icon: CalendarRange, id: 'next7', labelKey: 'sidebarNext7' },
  { icon: CalendarOff, id: 'undated', labelKey: 'sidebarUndated' },
] as const

const statusScopes = [
  { icon: Circle, id: 'todo', labelKey: 'statusTodo' },
  { icon: CircleDotDashed, id: 'doing', labelKey: 'statusDoing' },
  { icon: CircleCheck, id: 'done', labelKey: 'statusDone' },
] as const

export function TodoListSidebar({
  locale,
  onSelectionChange,
  selection,
  summary,
  t,
}: {
  locale: string
  onSelectionChange: (selection: TodoListSelection) => Promise<void> | void
  selection: TodoListSelection
  summary: TodoListSummary
  t: TFunction
}) {
  const selectionKey = todoListSelectionKey(selection)
  const notes = useMemo(() => [...summary.notes].sort((left, right) => (
    Number(right.favorite) - Number(left.favorite)
    || left.title.localeCompare(right.title, locale)
  )), [locale, summary.notes])

  return (
    <nav {...stylex.props(styles.root)} aria-label={t('sidebarLabel')}>
      <TodoListSidebarSection label={t('sidebarSmartViews')}>
        <ul {...stylex.props(styles.list)}>
          {smartScopes.map(item => (
            <TodoListSidebarItem
              active={selectionKey === `scope:${item.id}`}
              count={summary.counts[item.id]}
              icon={item.icon}
              key={item.id}
              label={t(item.labelKey)}
              onSelect={() => void onSelectionChange({ id: item.id, kind: 'scope' })}
            />
          ))}
        </ul>
      </TodoListSidebarSection>

      <TodoListSidebarSection collapsible label={t('sidebarNotes')}>
        {notes.length === 0
          ? <p {...stylex.props(styles.empty)}>{t('sidebarNoNotes')}</p>
          : (
              <ul {...stylex.props(styles.list)}>
                {notes.map(note => (
                  <TodoListSidebarItem
                    active={selectionKey === `note:${note.noteId}`}
                    count={note.count}
                    icon={FileText}
                    key={note.noteId}
                    label={note.title}
                    onSelect={() => void onSelectionChange({ kind: 'note', noteId: note.noteId })}
                  />
                ))}
              </ul>
            )}
      </TodoListSidebarSection>

      <TodoListSidebarSection label={t('sidebarStatus')}>
        <ul {...stylex.props(styles.list)}>
          {statusScopes.map(item => (
            <TodoListSidebarItem
              active={selectionKey === `scope:${item.id}`}
              count={summary.counts[item.id]}
              icon={item.icon}
              key={item.id}
              label={t(item.labelKey)}
              onSelect={() => void onSelectionChange({ id: item.id, kind: 'scope' })}
            />
          ))}
        </ul>
      </TodoListSidebarSection>
    </nav>
  )
}
