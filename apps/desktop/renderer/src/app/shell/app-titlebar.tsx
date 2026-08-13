import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import type { PageTitlebarOptions } from '../../shared/page-titlebar'
import * as stylex from '@stylexjs/stylex'
import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { useTranslation } from 'react-i18next'
import { router } from '../router'
import { appTitlebarStyles } from './app-titlebar.stylex'

interface HistoryPosition {
  index: number
  maxIndex: number
}

const navigationSpring = {
  bounce: 0.12,
  type: 'spring',
  visualDuration: 0.3,
} as const

function historyIndex(): number {
  return router.history.location.state.__TSR_index
}

function EditableTitle({
  onRename,
  t,
  title,
}: {
  onRename: (title: string) => Promise<{ error?: string } | void>
  t: TFunction
  title: string
}) {
  const [draft, setDraft] = useState(title)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)

  useLayoutEffect(() => {
    if (!editing)
      return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const cancel = useCallback(() => {
    if (savingRef.current)
      return
    setDraft(title)
    setError(null)
    setEditing(false)
  }, [title])

  const commit = useCallback(async () => {
    if (savingRef.current)
      return
    const normalized = draft.trim()
    if (normalized.length === 0) {
      setError(t('noteTitleCannotBeEmpty'))
      inputRef.current?.focus()
      inputRef.current?.select()
      return
    }
    if (normalized === title) {
      setDraft(normalized)
      setError(null)
      setEditing(false)
      return
    }

    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await onRename(normalized)
      if (result?.error) {
        setError(result.error)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        })
        return
      }
      setDraft(normalized)
      setEditing(false)
    }
    catch {
      setError(t('couldNotRename'))
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
    finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [draft, onRename, t, title])

  if (editing) {
    return (
      <>
        <input
          ref={inputRef}
          {...stylex.props(appTitlebarStyles.titleInput)}
          aria-busy={saving}
          aria-invalid={error !== null}
          aria-label={error ?? t('noteTitle')}
          data-window-no-drag=""
          readOnly={saving}
          required
          title={error ?? t('renameNote')}
          value={draft}
          onBlur={() => {
            if (savingRef.current)
              return
            if (draft.trim().length === 0)
              cancel()
            else
              void commit()
          }}
          onChange={(event) => {
            setDraft(event.target.value)
            if (event.target.value.trim().length > 0)
              setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void commit()
            }
            else if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
        />
        {error
          ? <span {...stylex.props(appTitlebarStyles.visuallyHidden)} role="status">{error}</span>
          : null}
      </>
    )
  }

  return (
    <button
      {...stylex.props(appTitlebarStyles.titleButton)}
      aria-label={t('renameNoteFor', { title })}
      data-window-no-drag=""
      title={t('renameNote')}
      type="button"
      onClick={() => setEditing(true)}
    >
      <span {...stylex.props(appTitlebarStyles.titleText)}>{title}</span>
      <Pencil {...stylex.props(appTitlebarStyles.renameIcon)} aria-hidden="true" strokeWidth={1.8} />
    </button>
  )
}

function NavigationButton({
  children,
  disabled = false,
  label,
  onClick,
  title = label,
}: {
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  title?: string
}) {
  return (
    <button
      {...stylex.props(appTitlebarStyles.navigationButton)}
      aria-label={label}
      data-window-no-drag=""
      disabled={disabled}
      title={title}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function AppTitlebar({
  page,
  sidebarVisible,
}: {
  page: PageTitlebarOptions | null
  sidebarVisible: boolean
}) {
  const { t } = useTranslation('app')
  const [historyPosition, setHistoryPosition] = useState<HistoryPosition>(() => {
    const index = historyIndex()
    return { index, maxIndex: index }
  })
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => router.history.subscribe(({ action, location }) => {
    const index = location.state.__TSR_index
    setHistoryPosition(current => ({
      index,
      maxIndex: action.type === 'PUSH' ? index : Math.max(current.maxIndex, index),
    }))
  }), [])

  useEffect(() => {
    document.title = page?.title ? `${page.title} ${t('appTitleSuffix')}` : t('appTitle')
  }, [page?.title, t])

  const canGoBack = historyPosition.index > 0
  const canGoForward = historyPosition.index < historyPosition.maxIndex
  const compactCanvasTitlebar = page?.titleVisibility === 'hidden'
  const navigationOffset = sidebarVisible ? 270 : compactCanvasTitlebar ? 55 : 120
  const leadingOffset = navigationOffset + 76

  return (
    <header
      {...stylex.props(
        appTitlebarStyles.titlebar,
        page?.titleVisibility === 'hidden' && appTitlebarStyles.titlebarPassThrough,
      )}
      data-window-drag={page?.titleVisibility === 'hidden' ? undefined : ''}
    >
      {page?.navigation !== 'hidden'
        ? (
            <motion.div
              {...stylex.props(appTitlebarStyles.navigationGroup)}
              animate={{ left: navigationOffset }}
              aria-label={t('pageNavigation')}
              initial={false}
              role="group"
              transition={shouldReduceMotion ? { duration: 0 } : navigationSpring}
            >
              <NavigationButton
                disabled={!canGoBack}
                label={t('back')}
                title={canGoBack ? t('back') : t('noPreviousPage')}
                onClick={() => router.history.back()}
              >
                <ChevronLeft aria-hidden="true" size={18} strokeWidth={1.9} />
              </NavigationButton>
              <NavigationButton
                disabled={!canGoForward}
                label={t('forward')}
                title={canGoForward ? t('forward') : t('noNextPage')}
                onClick={() => router.history.forward()}
              >
                <ChevronRight aria-hidden="true" size={18} strokeWidth={1.9} />
              </NavigationButton>
            </motion.div>
          )
        : null}
      {page?.leading
        ? (
            <motion.div
              {...stylex.props(appTitlebarStyles.leadingSlot)}
              animate={{ left: leadingOffset }}
              data-window-no-drag=""
              initial={false}
              transition={shouldReduceMotion ? { duration: 0 } : navigationSpring}
            >
              {page.leading}
            </motion.div>
          )
        : null}
      {page?.titleVisibility !== 'hidden'
        ? (
            <div
              {...stylex.props(
                appTitlebarStyles.titleSlot,
                page?.titleVisibility === 'wide' && appTitlebarStyles.titleSlotWide,
              )}
            >
              {page?.title
                ? page.onRenameTitle
                  ? <EditableTitle key={page.title} onRename={page.onRenameTitle} t={t} title={page.title} />
                  : (
                      <div {...stylex.props(appTitlebarStyles.staticTitle)}>
                        <span {...stylex.props(appTitlebarStyles.titleText)}>{page.title}</span>
                      </div>
                    )
                : null}
            </div>
          )
        : null}
      {page?.trailing
        ? (
            <div
              {...stylex.props(
                appTitlebarStyles.navigationGroup,
                appTitlebarStyles.trailingGroup,
                page.sidebarAction !== undefined && appTitlebarStyles.trailingGroupWithSidebarAction,
              )}
              data-window-no-drag=""
            >
              {page.trailing}
            </div>
          )
        : null}
      {page?.sidebarAction
        ? (
            <div
              {...stylex.props(appTitlebarStyles.navigationGroup, appTitlebarStyles.sidebarActionGroup)}
              data-window-no-drag=""
            >
              {page.sidebarAction}
            </div>
          )
        : null}
    </header>
  )
}
