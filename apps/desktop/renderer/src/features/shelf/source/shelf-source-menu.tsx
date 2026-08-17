import type { ShelfSource } from '@memorilo/shelf'
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import { autoUpdate, flip, FloatingPortal, offset, shift, size, useFloating, useMergeRefs } from '@floating-ui/react'
import * as stylex from '@stylexjs/stylex'
import {
  Check,
  Globe2,
  LibraryBig,
  Settings2,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { floatingTransformOrigin } from '../../../shared/floating-ui'
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
  anchorRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onManage: () => void
  onSelect: (sourceId: string | null) => void
  open: boolean
  selectedSourceId: string | null
  sources: readonly ShelfSource[]
}

export function ShelfSourceMenu({
  anchorRef,
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
  const {
    floatingStyles,
    isPositioned,
    placement,
    refs,
  } = useFloating({
    middleware: [
      offset(8),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, Math.min(390, availableHeight))}px`
        },
      }),
    ],
    open,
    placement: 'bottom-start',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
  })
  const floatingMenuRef = useMergeRefs([menuRef, refs.setFloating])
  const animate = shouldReduceMotion ? { opacity: 1 } : { filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }
  const closedOffset = placement.startsWith('top') ? 5 : -5
  const exit = shouldReduceMotion ? { opacity: 0 } : { filter: 'blur(3px)', opacity: 0, scale: 0.97, y: closedOffset }

  useLayoutEffect(() => {
    refs.setReference(anchorRef.current)
  }, [anchorRef, refs])

  useEffect(() => {
    if (!open || !isPositioned)
      return
    const menuItems = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const selected = menuItems.find(item => item.getAttribute('aria-checked') === 'true') ?? menuItems[0]
    selected?.focus()
  }, [isPositioned, open])

  useEffect(() => {
    if (!open)
      return
    const closeOutside = (event: PointerEvent) => {
      const target = event.target
      if (
        target instanceof Node
        && !anchorRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        onClose()
      }
    }
    window.addEventListener('pointerdown', closeOutside, true)
    return () => window.removeEventListener('pointerdown', closeOutside, true)
  }, [anchorRef, onClose, open])

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
    <FloatingPortal>
      <AnimatePresence>
        {open
          ? (
              <motion.div
                ref={floatingMenuRef}
                {...stylex.props(shelfSourceStyles.sourceMenu)}
                animate={animate}
                aria-label={t('shelfBookSources')}
                exit={exit}
                initial={exit}
                role="menu"
                style={{
                  ...floatingStyles,
                  transformOrigin: floatingTransformOrigin(placement),
                  visibility: open && !isPositioned ? 'hidden' : 'visible',
                }}
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
    </FloatingPortal>
  )
}
