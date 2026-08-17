import type { ReactNode } from 'react'
import { Dialog } from '@memorilo/ui'
import { motion, useReducedMotion } from 'motion/react'
import { learningOptimizerSharedStyles as styles } from './learning-optimizer-shared.stylex'

export function LearningOptimizerDialog({
  children,
  label,
  onClose,
}: {
  children: ReactNode
  label: string
  onClose: () => void
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <Dialog.Root
      defaultOpen
      onOpenChange={(open) => {
        if (!open)
          onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content aria-label={label} asChild xstyle={styles.dialogSurface}>
          <motion.div
            animate={{ filter: 'brightness(1) saturate(1)', opacity: 1, scale: 1, y: 0 }}
            initial={{ filter: shouldReduceMotion ? 'none' : 'brightness(1.08) saturate(1.22)', opacity: shouldReduceMotion ? 1 : 0.72, scale: shouldReduceMotion ? 1 : 0.982, y: shouldReduceMotion ? 0 : 5 }}
            transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0, type: 'spring', visualDuration: 0.24 }}
          >
            {children}
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
