import type { ShelfSource } from '@memorilo/shelf'
import * as stylex from '@stylexjs/stylex'
import { Trash2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { shelfSharedStyles } from '../shelf-shared.stylex'
import { shelfSourceSheetSpring, useDialogFocus } from './shelf-source-dialog'
import { shelfSourceDialogStyles } from './shelf-source-dialog.stylex'
import { shelfSourceRemoveStyles } from './shelf-source-remove-sheet.stylex'

export function RemoveSourceSheet({
  isPending,
  onCancel,
  onConfirm,
  source,
}: {
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
  source: ShelfSource | null
}) {
  const { t } = useTranslation('app')
  const shouldReduceMotion = useReducedMotion()
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const sheetAnimate = shouldReduceMotion ? { opacity: 1 } : { filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }
  const sheetExit = shouldReduceMotion ? { opacity: 0 } : { filter: 'blur(4px)', opacity: 0, scale: 0.96, y: 14 }

  useDialogFocus({
    dialogRef,
    initialFocusRef: cancelButtonRef,
    isPending,
    onClose: onCancel,
    open: source !== null,
  })

  return (
    <AnimatePresence>
      {source
        ? (
            <motion.div {...stylex.props(shelfSourceDialogStyles.sheetLayer)} animate={{ opacity: 1 }} exit={{ opacity: 0 }} initial={{ opacity: 0 }}>
              <button {...stylex.props(shelfSourceDialogStyles.sheetScrim)} aria-label={t('shelfCancelRemoval')} disabled={isPending} type="button" onClick={onCancel} />
              <motion.section
                ref={dialogRef}
                {...stylex.props(shelfSourceRemoveStyles.confirmSheet)}
                animate={sheetAnimate}
                aria-labelledby="remove-source-title"
                aria-modal="true"
                exit={sheetExit}
                initial={sheetExit}
                role="dialog"
                tabIndex={-1}
                transition={shouldReduceMotion ? { duration: 0.16 } : shelfSourceSheetSpring}
              >
                <span {...stylex.props(shelfSourceRemoveStyles.destructiveGlyph)} aria-hidden="true"><Trash2 size={20} strokeWidth={1.7} /></span>
                <h2 id="remove-source-title" {...stylex.props(shelfSourceRemoveStyles.confirmTitle)}>{t('shelfRemoveSourceQuestion', { name: source.name })}</h2>
                <p {...stylex.props(shelfSourceRemoveStyles.confirmText)}>{t('shelfRemoveSourceExplanation')}</p>
                <div {...stylex.props(shelfSourceRemoveStyles.confirmActions)}>
                  <button ref={cancelButtonRef} {...stylex.props(shelfSharedStyles.secondaryButton)} disabled={isPending} type="button" onClick={onCancel}>{t('shelfCancel')}</button>
                  <button {...stylex.props(shelfSourceRemoveStyles.destructiveButton)} disabled={isPending} type="button" onClick={onConfirm}>
                    {isPending ? t('shelfRemoving') : t('shelfRemoveSource')}
                  </button>
                </div>
              </motion.section>
            </motion.div>
          )
        : null}
    </AnimatePresence>
  )
}
