import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog)
      throw new Error('Optimizer dialog is not mounted')
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={dialogRef}
      {...stylex.props(styles.dialog)}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget)
          onClose()
      }}
    >
      <motion.div
        {...stylex.props(styles.dialogSurface)}
        animate={{ filter: 'brightness(1) saturate(1)', opacity: 1, scale: 1, y: 0 }}
        initial={{ filter: shouldReduceMotion ? 'none' : 'brightness(1.08) saturate(1.22)', opacity: shouldReduceMotion ? 1 : 0.72, scale: shouldReduceMotion ? 1 : 0.982, y: shouldReduceMotion ? 0 : 5 }}
        transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0, type: 'spring', visualDuration: 0.24 }}
      >
        {children}
      </motion.div>
    </dialog>
  )
}
