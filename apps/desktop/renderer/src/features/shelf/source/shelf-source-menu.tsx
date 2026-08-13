import type { ShelfSource } from '@memorilo/shelf'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import {
  Check,
  Globe2,
  LibraryBig,
  Settings2,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { shelfSourceMenuStyles as shelfSourceStyles } from './shelf-source-menu.stylex'

const menuSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.2,
} as const

function shelfMenuTargetIndex(key: string, currentIndex: number, itemCount: number): number | null {
  if (itemCount <= 0)
    return null
  if (key === 'ArrowDown')
    return (currentIndex + 1) % itemCount
  if (key === 'ArrowUp')
    return (currentIndex - 1 + itemCount) % itemCount
  if (key === 'Home')
    return 0
  if (key === 'End')
    return itemCount - 1
  return null
}

export interface ShelfSourceMenuProps {
  onClose: () => void
  onManage: () => void
  onSelect: (sourceId: string | null) => void
  open: boolean
  selectedSourceId: string | null
  sources: readonly ShelfSource[]
}

export function ShelfSourceMenu({
  onClose,
  onManage,
  onSelect,
  open,
  selectedSourceId,
  sources,
}: ShelfSourceMenuProps) {
  const { t } = useTranslation('app')
  const menuRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const animate = shouldReduceMotion ? { opacity: 1 } : { filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }
  const exit = shouldReduceMotion ? { opacity: 0 } : { filter: 'blur(3px)', opacity: 0, scale: 0.97, y: -5 }

  useEffect(() => {
    if (!open)
      return
    const menuItems = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const selected = menuItems.find(item => item.getAttribute('aria-checked') === 'true') ?? menuItems[0]
    selected?.focus()
  }, [open])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menuItems = [...event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    const currentIndex = menuItems.findIndex(item => item === document.activeElement)
    const targetIndex = shelfMenuTargetIndex(event.key, currentIndex, menuItems.length)
    if (targetIndex !== null) {
      event.preventDefault()
      menuItems[targetIndex]?.focus()
    }
    else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {open
        ? (
            <motion.div
              ref={menuRef}
              {...stylex.props(shelfSourceStyles.sourceMenu)}
              animate={animate}
              aria-label={t('shelfBookSources')}
              exit={exit}
              initial={exit}
              role="menu"
              transition={shouldReduceMotion ? { duration: 0.12 } : menuSpring}
              onKeyDown={handleKeyDown}
            >
              <button
                {...stylex.props(shelfSourceStyles.sourceMenuItem, selectedSourceId === null && shelfSourceStyles.sourceMenuItemSelected)}
                role="menuitemradio"
                aria-checked={selectedSourceId === null}
                type="button"
                onClick={() => onSelect(null)}
              >
                <LibraryBig size={16} strokeWidth={1.8} aria-hidden="true" />
                <span {...stylex.props(shelfSourceStyles.sourceMenuLabel)}>{t('shelfAllSources')}</span>
                {selectedSourceId === null ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : null}
              </button>
              <div {...stylex.props(shelfSourceStyles.menuSeparator)} />
              <div {...stylex.props(shelfSourceStyles.sourceMenuScroll)}>
                {sources.map(source => (
                  <button
                    key={source.id}
                    {...stylex.props(shelfSourceStyles.sourceMenuItem, selectedSourceId === source.id && shelfSourceStyles.sourceMenuItemSelected)}
                    aria-checked={selectedSourceId === source.id}
                    role="menuitemradio"
                    type="button"
                    onClick={() => onSelect(source.id)}
                  >
                    <Globe2 size={16} strokeWidth={1.8} aria-hidden="true" />
                    <span {...stylex.props(shelfSourceStyles.sourceMenuLabel)}>
                      <strong>{source.name}</strong>
                      <small>{source.username ?? new URL(source.url).host}</small>
                    </span>
                    {selectedSourceId === source.id ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
              <div {...stylex.props(shelfSourceStyles.menuSeparator)} />
              <button {...stylex.props(shelfSourceStyles.sourceMenuItem)} role="menuitem" type="button" onClick={onManage}>
                <Settings2 size={16} strokeWidth={1.8} aria-hidden="true" />
                <span {...stylex.props(shelfSourceStyles.sourceMenuLabel)}>{t('shelfManageSources')}</span>
              </button>
            </motion.div>
          )
        : null}
    </AnimatePresence>
  )
}
