import type { DesktopTodoCalendarSubscription } from '@memorilo/desktop-api'
import type { CSSProperties, FormEvent } from 'react'
import { Dialog } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { LockKeyhole, Minus, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopRequests } from '../shared/desktop-requests'
import { loadTodoCalendarSnapshot, reloadTodoCalendarSnapshot } from '../shared/todo-calendar-cache'
import { todoCalendarColor } from '../shared/todo-calendar-color'
import { calendarSettingsStyles as styles } from './calendar-settings.stylex'
import { settingsShellStyles } from './settings-shell.stylex'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function AddCalendarDialog({
  error,
  submitting,
  title,
  url,
  onClose,
  onSubmit,
  onTitleChange,
  onUrlChange,
}: {
  error: string | null
  submitting: boolean
  title: string
  url: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTitleChange: (value: string) => void
  onUrlChange: (value: string) => void
}) {
  const { t } = useTranslation('settings')

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open)
          onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-label={t('calendarAdd')}>
          <form {...stylex.props(styles.dialogForm)} onSubmit={onSubmit}>
            <Dialog.Header>
              <Dialog.Title>{t('calendarAdd')}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <label {...stylex.props(styles.field)}>
                <span>{t('calendarTitle')}</span>
                <input {...stylex.props(styles.input)} autoFocus disabled={submitting} required value={title} onChange={event => onTitleChange(event.target.value)} />
              </label>
              <label {...stylex.props(styles.field)}>
                <span>{t('calendarUrl')}</span>
                <input {...stylex.props(styles.input)} disabled={submitting} placeholder="webcal://" required type="url" value={url} onChange={event => onUrlChange(event.target.value)} />
              </label>
              {error !== null ? <p {...stylex.props(styles.dialogError)} role="alert">{t('calendarOperationFailed', { message: error })}</p> : null}
            </Dialog.Body>
            <Dialog.Footer>
              <button {...stylex.props(styles.secondaryButton)} disabled={submitting} type="button" onClick={onClose}>{t('cancel')}</button>
              <button {...stylex.props(styles.primaryButton)} disabled={submitting || title.trim().length === 0 || url.trim().length === 0} type="submit">{t('calendarAdd')}</button>
            </Dialog.Footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function CalendarSettings() {
  const { i18n, t } = useTranslation('settings')
  const [subscriptions, setSubscriptions] = useState<readonly DesktopTodoCalendarSubscription[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(() => typeof window.desktop !== 'undefined')
  const [operation, setOperation] = useState<'add' | 'refresh' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const selected = useMemo(
    () => subscriptions.find(subscription => subscription.id === selectedId) ?? null,
    [selectedId, subscriptions],
  )

  const applySnapshot = useCallback((next: readonly DesktopTodoCalendarSubscription[]) => {
    setSubscriptions(next)
    setSelectedId(current => next.some(subscription => subscription.id === current)
      ? current
      : next[0]?.id ?? null)
  }, [])

  useEffect(() => {
    if (typeof window.desktop === 'undefined')
      return
    let active = true
    void loadTodoCalendarSnapshot()
      .then((snapshot) => {
        if (active)
          applySnapshot(snapshot.subscriptions)
      })
      .catch((cause: unknown) => {
        if (active)
          setError(errorMessage(cause))
      })
      .finally(() => {
        if (active)
          setLoading(false)
      })
    return () => {
      active = false
    }
  }, [applySnapshot])

  const reload = useCallback(async () => {
    const snapshot = await reloadTodoCalendarSnapshot()
    applySnapshot(snapshot.subscriptions)
  }, [applySnapshot])

  const addSubscription = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (operation !== null)
      return
    setAddError(null)
    setOperation('add')
    try {
      const subscription = await desktopRequests.subscribeTodoCalendar({ title, url })
      await reload()
      setSelectedId(subscription.id)
      setAdding(false)
      setTitle('')
      setUrl('')
    }
    catch (cause) {
      setAddError(errorMessage(cause))
    }
    finally {
      setOperation(null)
    }
  }

  const closeAddDialog = () => {
    if (operation === 'add')
      return
    setAdding(false)
    setAddError(null)
    setTitle('')
    setUrl('')
  }

  const refreshSelected = async () => {
    if (!selected || operation !== null)
      return
    setError(null)
    setOperation('refresh')
    try {
      await desktopRequests.refreshTodoCalendar(selected.id)
      await reload()
    }
    catch (cause) {
      setError(errorMessage(cause))
    }
    finally {
      setOperation(null)
    }
  }

  const removeSelected = async () => {
    if (!selected || selected.builtIn || operation !== null)
      return
    setError(null)
    setOperation('remove')
    try {
      await desktopRequests.removeTodoCalendar(selected.id)
      await reload()
    }
    catch (cause) {
      setError(errorMessage(cause))
    }
    finally {
      setOperation(null)
    }
  }

  return (
    <section aria-labelledby="calendar-subscriptions-heading">
      <h2 id="calendar-subscriptions-heading" {...stylex.props(settingsShellStyles.sectionTitle)}>{t('calendarSubscriptions')}</h2>
      <div {...stylex.props(styles.manager)} data-window-no-drag="">
        <div {...stylex.props(styles.list)} role="listbox" aria-label={t('calendarSubscriptions')}>
          {subscriptions.map((subscription) => {
            const selectedRow = subscription.id === selectedId
            const colorStyle = { '--calendar-color': todoCalendarColor(subscription.id) } as CSSProperties
            return (
              <button
                key={subscription.id}
                {...stylex.props(styles.row, selectedRow && styles.rowSelected)}
                aria-selected={selectedRow}
                role="option"
                style={colorStyle}
                type="button"
                onClick={() => setSelectedId(subscription.id)}
              >
                <span {...stylex.props(styles.swatch)} aria-hidden="true" />
                <span {...stylex.props(styles.rowText)}>
                  <span {...stylex.props(styles.rowTitle)}>{subscription.title}</span>
                  <span {...stylex.props(styles.rowUrl)}>{subscription.url}</span>
                </span>
                <span {...stylex.props(styles.rowMeta)}>
                  {subscription.builtIn
                    ? (
                        <>
                          <LockKeyhole aria-hidden="true" size={11} strokeWidth={1.8} />
                          {t('calendarBuiltIn')}
                        </>
                      )
                    : subscription.fetchedAt === null
                      ? t('calendarNotLoaded')
                      : new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(subscription.fetchedAt)}
                </span>
              </button>
            )
          })}
          {!loading && subscriptions.length === 0
            ? <div {...stylex.props(styles.empty)}>{t('calendarSubscriptionsEmpty')}</div>
            : null}
          {loading ? <div {...stylex.props(styles.empty)} role="status">{t('calendarSubscriptionsLoading')}</div> : null}
        </div>
        <div {...stylex.props(styles.toolbar)}>
          <button
            {...stylex.props(styles.toolButton)}
            aria-label={t('calendarAdd')}
            title={t('calendarAdd')}
            type="button"
            onClick={() => {
              setAdding(true)
              setAddError(null)
              setError(null)
            }}
          >
            <Plus aria-hidden="true" size={15} strokeWidth={1.9} />
          </button>
          <button
            {...stylex.props(styles.toolButton)}
            aria-label={t('calendarRemove')}
            disabled={selected === null || selected.builtIn || operation !== null}
            title={selected?.builtIn ? t('calendarBuiltInCannotRemove') : t('calendarRemove')}
            type="button"
            onClick={() => void removeSelected()}
          >
            <Minus aria-hidden="true" size={15} strokeWidth={1.9} />
          </button>
          <span {...stylex.props(styles.toolbarSpacer)} />
          <button
            {...stylex.props(styles.toolButton)}
            aria-label={t('calendarRefresh')}
            disabled={selected === null || operation !== null}
            title={t('calendarRefresh')}
            type="button"
            onClick={() => void refreshSelected()}
          >
            <RefreshCw {...stylex.props(operation === 'refresh' && styles.spinning)} aria-hidden="true" size={14} strokeWidth={1.9} />
          </button>
        </div>
      </div>
      {adding
        ? (
            <AddCalendarDialog
              error={addError}
              submitting={operation === 'add'}
              title={title}
              url={url}
              onClose={closeAddDialog}
              onSubmit={event => void addSubscription(event)}
              onTitleChange={setTitle}
              onUrlChange={setUrl}
            />
          )
        : null}
      {error !== null ? <p {...stylex.props(styles.error)} role="alert">{t('calendarOperationFailed', { message: error })}</p> : null}
    </section>
  )
}
