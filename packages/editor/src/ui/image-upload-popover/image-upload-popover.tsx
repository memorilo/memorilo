'use client'

import type { Uploader } from 'prosekit/extensions/file'
import type { OpenChangeEvent } from 'prosekit/web/popover'
import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { PopoverPopup, PopoverPositioner, PopoverRoot, PopoverTrigger } from 'prosekit/react/popover'
import { useState } from 'react'

import { Button } from '../button/index.ts'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import ImageUploadForm from './image-upload-form.tsx'
import { imageUploadPopoverStyles } from './image-upload-popover.stylex'

export default function ImageUploadPopover(props: {
  uploader: Uploader<string>
  tooltip: string
  disabled: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  const handleOpenChange = (event: OpenChangeEvent) => {
    setOpen(event.detail)
  }

  return (
    <PopoverRoot open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger>
        <Button pressed={open} disabled={props.disabled} tooltip={props.tooltip}>
          {props.children}
        </Button>
      </PopoverTrigger>

      <PopoverPositioner {...stylex.props(floatingSurfaceStyles.positioner)} placement="bottom">
        <PopoverPopup
          {...stylex.props(
            floatingSurfaceStyles.motion,
            floatingSurfaceStyles.surface,
            imageUploadPopoverStyles.card,
          )}
        >
          {open ? <ImageUploadForm uploader={props.uploader} onComplete={() => setOpen(false)} /> : null}
        </PopoverPopup>
      </PopoverPositioner>
    </PopoverRoot>
  )
}
