import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify/unstyled'
import { useDesktopConfiguration } from '../../shared/configuration'
import {
  hasTodoCalendarSnapshot,
  loadTodoCalendarSnapshot,
  reloadTodoCalendarSnapshot,
  todoCalendarAutoRefreshIntervalMs,
} from '../../shared/todo-calendar-cache'

export function TodoCalendarBootstrap() {
  const configuration = useDesktopConfiguration()
  const { t } = useTranslation('todo')

  useEffect(() => {
    if (!configuration.todo.enabled)
      return

    let active = true
    const toastId = hasTodoCalendarSnapshot()
      ? null
      : toast.loading(t('loadingCalendars'), {
          autoClose: false,
          closeButton: false,
          closeOnClick: false,
          draggable: false,
        })

    void loadTodoCalendarSnapshot()
      .then(() => {
        if (active && toastId !== null)
          toast.dismiss(toastId)
      })
      .catch((cause: unknown) => {
        if (!active || toastId === null)
          return
        toast.update(toastId, {
          autoClose: false,
          closeButton: true,
          isLoading: false,
          render: t('couldNotLoadCalendars', {
            message: cause instanceof Error ? cause.message : String(cause),
          }),
          type: 'error',
        })
      })

    const refresh = () => {
      void reloadTodoCalendarSnapshot().catch((error: unknown) => {
        console.error('Failed to automatically refresh Todo calendars', error)
      })
    }
    const timer = window.setInterval(refresh, todoCalendarAutoRefreshIntervalMs)
    window.addEventListener('focus', refresh)

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      if (toastId !== null)
        toast.dismiss(toastId)
    }
  }, [configuration.todo.enabled, t])

  return null
}
