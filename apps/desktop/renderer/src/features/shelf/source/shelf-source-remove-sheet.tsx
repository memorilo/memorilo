import type { ShelfSource } from '@memorilo/shelf'
import { AlertDialog, Button } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { Trash2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { shelfSharedStyles } from '../shelf-shared.stylex'
import { shelfSourceSheetSpring } from './shelf-source-dialog'
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
  const sheetAnimate = shouldReduceMotion ? { opacity: 1 } : { filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }
  const sheetExit = shouldReduceMotion ? { opacity: 0 } : { filter: 'blur(4px)', opacity: 0, scale: 0.96, y: 14 }

  return (
    <AlertDialog.Root
      open={source !== null}
      onOpenChange={(open) => {
        if (!open && !isPending)
          onCancel()
      }}
    >
      <AlertDialog.Portal forceMount>
        <AnimatePresence>
          {source
            ? (
                <motion.div {...stylex.props(shelfSourceDialogStyles.sheetLayer)} animate={{ opacity: 1 }} exit={{ opacity: 0 }} initial={{ opacity: 0 }}>
                  <AlertDialog.Overlay variant="sheet" />
                  <AlertDialog.Content
                    aria-labelledby="remove-source-title"
                    asChild
                    position="custom"
                    variant="alert"
                  >
                    <motion.section
                      animate={sheetAnimate}
                      exit={sheetExit}
                      initial={sheetExit}
                      transition={shouldReduceMotion ? { duration: 0.16 } : shelfSourceSheetSpring}
                    >
                      <span {...stylex.props(shelfSourceRemoveStyles.destructiveGlyph)} aria-hidden="true"><Trash2 size={20} strokeWidth={1.7} /></span>
                      <h2 id="remove-source-title" {...stylex.props(shelfSourceRemoveStyles.confirmTitle)}>{t('shelfRemoveSourceQuestion', { name: source.name })}</h2>
                      <p {...stylex.props(shelfSourceRemoveStyles.confirmText)}>{t('shelfRemoveSourceExplanation')}</p>
                      <div {...stylex.props(shelfSourceRemoveStyles.confirmActions)}>
                        <AlertDialog.Cancel asChild>
                          <Button autoFocus disabled={isPending} variant="secondary" xstyle={shelfSharedStyles.secondaryButton}>{t('shelfCancel')}</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                          <Button
                            disabled={isPending}
                            variant="plain"
                            xstyle={shelfSourceRemoveStyles.destructiveButton}
                            onClick={(event) => {
                              event.preventDefault()
                              onConfirm()
                            }}
                          >
                            {isPending ? t('shelfRemoving') : t('shelfRemoveSource')}
                          </Button>
                        </AlertDialog.Action>
                      </div>
                    </motion.section>
                  </AlertDialog.Content>
                </motion.div>
              )
            : null}
        </AnimatePresence>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
