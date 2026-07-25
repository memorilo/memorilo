'use client'

import type { Uploader } from 'prosekit/extensions/file'
import type { ImageExtension } from 'prosekit/extensions/image'
import * as stylex from '@stylexjs/stylex'
import { useEditor } from 'prosekit/react'
import { useId, useState } from 'react'

import { editorStyles } from '../../styles/editor.stylex'

export default function ImageUploadForm(props: {
  uploader: Uploader<string>
  onComplete: () => void
}) {
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const ariaId = useId()
  const editor = useEditor<ImageExtension>()

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextFile = event.target.files?.[0]

    if (nextFile) {
      setFile(nextFile)
      setUrl('')
      return
    }

    setFile(null)
  }

  const handleUrlChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextUrl = event.target.value
    setUrl(nextUrl)
    if (nextUrl) {
      setFile(null)
    }
  }

  const handleSubmit = () => {
    if (url) {
      editor.commands.insertImage({ src: url })
    }
    else if (file) {
      editor.commands.uploadImage({ file, uploader: props.uploader })
    }
    else {
      throw new Error('An image URL or file is required')
    }

    props.onComplete()
    editor.focus()
  }

  return (
    <div {...stylex.props(editorStyles.imageUploadForm)}>
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
                {...stylex.props(editorStyles.textInput, editorStyles.fileInput)}
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
    </div>
  )
}
