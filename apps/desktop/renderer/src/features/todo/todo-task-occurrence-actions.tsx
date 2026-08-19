import type { DesktopTodoCalendarEvent, DesktopTodoTask } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { autoUpdate, flip, FloatingPortal, offset, shift, size, useFloating, useMergeRefs } from '@floating-ui/react'
import { TaskOccurrencePanel } from '@memorilo/editor/task-ui'
import * as stylex from '@stylexjs/stylex'
import { useEffect, useId, useRef, useState } from 'react'
import { floatingTransformOrigin } from '../../shared/floating-ui'
import { taskOccurrenceDate } from './todo-model'
import { todoTaskOccurrenceActionStyles as styles } from './todo-task-occurrence-actions.stylex'

export interface TodoTaskUpdateInput {
  blockId: string
  allDay?: boolean
  dueDate?: string | null
  dueTime?: string | null
  endAt?: string | null
  nextDueDate?: string | null
  noteId: string
  onlyThis?: boolean
  reminderMinutes?: number | null
  reminders?: DesktopTodoTask['reminders']
  repeatRule?: DesktopTodoTask['repeatRule']
  startAt?: string | null
  status?: DesktopTodoTask['status']
  text?: string
  topicId: string
}

interface TodoTaskOccurrenceActionsProps {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  onUpdateTask: (input: TodoTaskUpdateInput) => Promise<void>
  t: TFunction
  task: DesktopTodoTask
  triggerContent: ReactNode
}

const menuGap = 5
const viewportInset = 8

export function TodoTaskOccurrenceActions({
  calendarEvents,
  onUpdateTask,
  t,
  task,
  triggerContent,
}: TodoTaskOccurrenceActionsProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const {
    floatingStyles,
    isPositioned,
    placement,
    refs,
  } = useFloating({
    middleware: [
      offset(menuGap),
      flip({ padding: viewportInset }),
      shift({ padding: viewportInset }),
      size({
        padding: viewportInset,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`
        },
      }),
    ],
    open,
    placement: 'bottom-start',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
  })
  const referenceRef = useMergeRefs([triggerRef, refs.setReference])
  const floatingRef = useMergeRefs([panelRef, refs.setFloating])
  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus)
      triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open)
      return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node
        && (triggerRef.current?.contains(target) || panelRef.current?.contains(target))) {
        return
      }
      close(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape')
        return
      event.preventDefault()
      close(true)
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const openFromContext = (event: ReactMouseEvent<HTMLSpanElement>) => {
    if (!task.repeatRule)
      return
    event.preventDefault()
    event.stopPropagation()
    setOpen(current => !current)
  }

  const openFromKeyboard = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (!task.repeatRule || (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)))
      return
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
  }

  return (
    <>
      <span
        ref={referenceRef}
        {...stylex.props(styles.shell, !task.repeatRule && styles.inactive)}
        aria-expanded={task.repeatRule ? open : undefined}
        aria-haspopup={task.repeatRule ? 'dialog' : undefined}
        aria-label={task.repeatRule ? t('occurrenceActions') : undefined}
        role={task.repeatRule ? 'button' : undefined}
        tabIndex={task.repeatRule ? 0 : -1}
        onContextMenu={openFromContext}
        onKeyDown={openFromKeyboard}
      >
        {triggerContent}
      </span>
      {open && task.repeatRule
        ? (
            <FloatingPortal>
              <TaskOccurrencePanel
                key={`${task.blockId}:${task.allDay}:${task.dueDate ?? ''}:${JSON.stringify(task.repeatRule)}:${task.text}`}
                calendarEvents={calendarEvents}
                id={menuId}
                panelRef={floatingRef}
                style={{
                  ...floatingStyles,
                  transformOrigin: floatingTransformOrigin(placement),
                }}
                t={t}
                task={{
                  allDay: task.allDay,
                  dueDate: task.dueDate,
                  dueTime: task.dueTime,
                  endAt: task.endAt,
                  occurrenceDate: taskOccurrenceDate(task),
                  reminderMinutes: task.reminderMinutes,
                  reminders: task.reminders,
                  repeatRule: task.repeatRule,
                  startAt: task.startAt,
                  status: task.status,
                  text: task.text,
                }}
                visible={isPositioned}
                onUpdate={input => onUpdateTask({
                  ...input,
                  blockId: task.blockId,
                  noteId: task.noteId,
                  topicId: task.topicId,
                })}
                onUpdated={() => close(true)}
              />
            </FloatingPortal>
          )
        : null}
    </>
  )
}
