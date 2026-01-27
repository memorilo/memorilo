'use client'

import type { Variants } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { cn } from '@memorilo/utils/utils'
import { motion, useAnimation } from 'motion/react'

import { useCallback, useImperativeHandle, useRef } from 'react'

export interface StrikethroughIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface StrikethroughIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const variants: Variants = {
  normal: { pathLength: 1, opacity: 1, pathOffset: 0 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    pathOffset: [1, 0],
  },
}

function StrikethroughIcon({ ref, onMouseEnter, onMouseLeave, className, size = 28, ...props }: StrikethroughIconProps & { ref?: React.RefObject<StrikethroughIconHandle | null> }) {
  const controls = useAnimation()
  const isControlledRef = useRef(false)

  useImperativeHandle(ref, () => {
    isControlledRef.current = true

    return {
      startAnimation: () => controls.start('animate'),
      stopAnimation: () => controls.start('normal'),
    }
  })

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isControlledRef.current) {
        controls.start('animate')
      }
      else {
        onMouseEnter?.(e)
      }
    },
    [controls, onMouseEnter],
  )

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isControlledRef.current) {
        controls.start('normal')
      }
      else {
        onMouseLeave?.(e)
      }
    },
    [controls, onMouseLeave],
  )

  return (
    <div
      className={cn(className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          transition={{ duration: 0.3 }}
          variants={variants}
          animate={controls}
          d="M16 4h-6a4 4 0 0 0 -4 4a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4a4 4 0 0 1 -4 4h-6"
        />
        <motion.line
          x1="4"
          x2="20"
          y1="12"
          y2="12"
          variants={variants}
          transition={{
            delay: 0.2,
            duration: 0.4,
          }}
          animate={controls}
        />
      </svg>
    </div>
  )
}

StrikethroughIcon.displayName = 'StrikethroughIcon'

export { StrikethroughIcon }
