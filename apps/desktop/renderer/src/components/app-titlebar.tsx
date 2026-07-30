import type { ReactNode } from 'react'
import type { PageTitlebarOptions } from './page-titlebar'
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

function EditableTitle({ onRename, title }: { onRename: (title: string) => void, title: string }) {
  const [draft, setDraft] = useState(title)
  const [editing, setEditing] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (!editing)
      return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const cancel = useCallback(() => {
    setDraft(title)
    setInvalid(false)
    setEditing(false)
  }, [title])

  const commit = useCallback(() => {
    const normalized = draft.trim()
    if (normalized.length === 0) {
      setInvalid(true)
      inputRef.current?.focus()
      inputRef.current?.select()
      return false
    }
    if (normalized !== title)
      onRename(normalized)
    setDraft(normalized)
    setInvalid(false)
    setEditing(false)
    return true
  }, [draft, onRename, title])

  if (editing) {
    return (
      <input
        ref={inputRef}
        {...stylex.props(appTitlebarStyles.titleInput)}
        aria-invalid={invalid}
        aria-label={invalid ? 'Note title cannot be empty' : 'Note title'}
        data-window-no-drag=""
        required
        value={draft}
        onBlur={() => {
          if (draft.trim().length === 0)
            cancel()
          else
            commit()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          if (event.target.value.trim().length > 0)
            setInvalid(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
          else if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
      />
    )
  }

  return (
    <button
      {...stylex.props(appTitlebarStyles.titleButton)}
      aria-label={`Rename Note: ${title}`}
      data-window-no-drag=""
      title="Rename Note"
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
    document.title = page?.title ? `${page.title} — Memorilo` : 'Memorilo'
  }, [page?.title])

  const canGoBack = historyPosition.index > 0
  const canGoForward = historyPosition.index < historyPosition.maxIndex
  const navigationOffset = sidebarVisible ? 270 : 120

  return (
    <header
      {...stylex.props(appTitlebarStyles.titlebar)}
      data-window-drag=""
    >
      <motion.div
        {...stylex.props(appTitlebarStyles.navigationGroup)}
        animate={{ left: navigationOffset }}
        aria-label="Page navigation"
        initial={false}
        role="group"
        transition={shouldReduceMotion ? { duration: 0 } : navigationSpring}
      >
        <NavigationButton
          disabled={!canGoBack}
          label="Back"
          title={canGoBack ? 'Back' : 'No previous page'}
          onClick={() => router.history.back()}
        >
          <ChevronLeft aria-hidden="true" size={18} strokeWidth={1.9} />
        </NavigationButton>
        <NavigationButton
          disabled={!canGoForward}
          label="Forward"
          title={canGoForward ? 'Forward' : 'No next page'}
          onClick={() => router.history.forward()}
        >
          <ChevronRight aria-hidden="true" size={18} strokeWidth={1.9} />
        </NavigationButton>
      </motion.div>
      <div {...stylex.props(appTitlebarStyles.titleSlot)}>
        {page?.title
          ? page.onRenameTitle
            ? <EditableTitle key={page.title} onRename={page.onRenameTitle} title={page.title} />
            : <span {...stylex.props(appTitlebarStyles.titleText)}>{page.title}</span>
          : null}
      </div>
    </header>
  )
}
