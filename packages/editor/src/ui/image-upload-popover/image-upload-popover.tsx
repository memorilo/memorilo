'use client'

import type { Uploader } from 'prosekit/extensions/file'
import type { ReactNode } from 'react'
import { Popover } from '@memorilo/ui'
import { useState } from 'react'

import { Button } from '../button/index.ts'
import { editorPositionerAdapterStyles } from '../floating-surface/editor-positioner-adapter.stylex'
import ImageUploadForm from './image-upload-form.tsx'
import { imageUploadPopoverStyles } from './image-upload-popover.stylex'

export default function ImageUploadPopover(props: {
  uploader: Uploader<string>
  tooltip: string
  disabled: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button pressed={open} disabled={props.disabled} tooltip={props.tooltip}>
          {props.children}
        </Button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={6}
          variant="popover"
          xstyle={[
            editorPositionerAdapterStyles.motion,
            imageUploadPopoverStyles.card,
          ]}
        >
          {open ? <ImageUploadForm uploader={props.uploader} onComplete={() => setOpen(false)} /> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
