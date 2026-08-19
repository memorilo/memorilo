import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify/unstyled'
import { useDesktopConfiguration } from '../../shared/configuration'
import { hasTodoCalendarSnapshot, loadTodoCalendarSnapshot } from '../../shared/todo-calendar-cache'

export function TodoCalendarBootstrap() {
  const configuration = useDesktopConfiguration()
  const { t } = useTranslation('todo')

  useEffect(() => {
    if (!configuration.todo.enabled || hasTodoCalendarSnapshot())
      return

    const toastId = toast.loading(t('loadingCalendars'), {
      autoClose: false,
      closeButton: false,
      closeOnClick: false,
      draggable: false,
    })
    let active = true

    void loadTodoCalendarSnapshot()
      .then(() => {
        if (active)
          toast.dismiss(toastId)
      })
      .catch((cause: unknown) => {
        if (!active)
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

    return () => {
      active = false
      toast.dismiss(toastId)
    }
  }, [configuration.todo.enabled, t])

  return null
}
