'use client'

import type { Uploader } from 'prosekit/extensions/file'
import type { ImageExtension } from 'prosekit/extensions/image'
import type { OpenChangeEvent } from 'prosekit/web/popover'
import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useEditor } from 'prosekit/react'
import { PopoverPopup, PopoverPositioner, PopoverRoot, PopoverTrigger } from 'prosekit/react/popover'
import { useId, useState } from 'react'

import { editorStyles } from '../../styles/editor.stylex'
import { Button } from '../button/index.ts'

export default function ImageUploadPopover(props: {
  uploader: Uploader<string>
  tooltip: string
  disabled: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const ariaId = useId()

  const editor = useEditor<ImageExtension>()

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const file = event.target.files?.[0]

    if (file) {
      setFile(file)
      setUrl('')
    }
    else {
      setFile(null)
    }
  }

  const handleUrlChange: React.ChangeEventHandler<HTMLInputElement> = (
    event,
  ) => {
    const url = event.target.value

    if (url) {
      setUrl(url)
      setFile(null)
    }
    else {
      setUrl('')
    }
  }

  const deferResetState = () => {
    setTimeout(() => {
      setUrl('')
      setFile(null)
    }, 300)
  }

  const handleSubmit = () => {
    if (url) {
      editor.commands.insertImage({ src: url })
    }
    else if (file) {
      editor.commands.uploadImage({ file, uploader: props.uploader })
    }
    setOpen(false)
    deferResetState()
  }

  const handleOpenChange = (event: OpenChangeEvent) => {
    if (!event.detail) {
      deferResetState()
    }
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
        <PopoverPopup {...stylex.props(editorStyles.popup, editorStyles.uploadCard)}>
          {file
            ? null
            : (
                <>
                  <label {...stylex.props(editorStyles.formLabel)} htmlFor={`id-link-${ariaId}`}>Embed Link</label>
                  <input
                    id={`id-link-${ariaId}`}
                    {...stylex.props(editorStyles.textInput)}
                    placeholder="Paste the image link..."
                    type="url"
                    value={url}
                    onChange={handleUrlChange}
                  />
                </>
              )}

          {url
            ? null
            : (
                <>
                  <label {...stylex.props(editorStyles.formLabel)} htmlFor={`id-upload-${ariaId}`}>Upload</label>
                  <input
                    id={`id-upload-${ariaId}`}
                    {...stylex.props(editorStyles.textInput)}
                    accept="image/*"
                    type="file"
                    onChange={handleFileChange}
                  />
                </>
              )}

          {url
            ? (
                <button {...stylex.props(editorStyles.primaryButton)} type="button" onClick={handleSubmit}>
                  Insert Image
                </button>
              )
            : null}

          {file
            ? (
                <button {...stylex.props(editorStyles.primaryButton)} type="button" onClick={handleSubmit}>
                  Upload Image
                </button>
              )
            : null}
        </PopoverPopup>
      </PopoverPositioner>
    </PopoverRoot>
  )
}
