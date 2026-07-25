'use client'

import type { Uploader } from 'prosekit/extensions/file'
import type { OpenChangeEvent } from 'prosekit/web/popover'
import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { PopoverPopup, PopoverPositioner, PopoverRoot, PopoverTrigger } from 'prosekit/react/popover'
import { useState } from 'react'

import { editorStyles } from '../../styles/editor.stylex'
import { Button } from '../button/index.ts'
import ImageUploadForm from './image-upload-form.tsx'

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

      <PopoverPositioner {...stylex.props(editorStyles.positioner)} placement="bottom">
        <PopoverPopup
          {...stylex.props(
            editorStyles.floatingSurfaceMotion,
            editorStyles.popupSurface,
            editorStyles.uploadCard,
          )}
        >
          {open ? <ImageUploadForm uploader={props.uploader} onComplete={() => setOpen(false)} /> : null}
        </PopoverPopup>
      </PopoverPositioner>
    </PopoverRoot>
  )
}
