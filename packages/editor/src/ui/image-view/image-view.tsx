'use client'

import type { ImageAttrs } from 'prosekit/extensions/image'
import type { ReactNodeViewProps } from 'prosekit/react'
import type { SyntheticEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { ImageOff, LoaderCircle } from 'lucide-react'
import { UploadTask } from 'prosekit/extensions/file'
import { ResizableHandle, ResizableRoot } from 'prosekit/react/resizable'
import { useEffect, useState } from 'react'

import { imageViewStyles } from './image-view.stylex'

export default function ImageView(props: ReactNodeViewProps) {
  const attrs = props.node.attrs as ImageAttrs
  const url = attrs.src || ''
  const uploading = url.startsWith('blob:')

  const [aspectRatio, setAspectRatio] = useState<number | undefined>()
  const [error, setError] = useState<string | undefined>()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!uploading)
      return

    const uploadTask = UploadTask.get<string>(url)
    if (!uploadTask)
      return

    let canceled = false

    uploadTask.finished.catch((error) => {
      if (canceled)
        return
      setError(String(error))
    })
    const unsubscribeProgress = uploadTask.subscribeProgress(({ loaded, total }) => {
      if (canceled)
        return
      setProgress(total ? loaded / total : 0)
    })

    return () => {
      canceled = true
      unsubscribeProgress()
    }
  }, [url, uploading])

  const handleImageLoad = (event: SyntheticEvent) => {
    const img = event.target as HTMLImageElement
    const { naturalWidth, naturalHeight } = img
    const ratio = naturalWidth / naturalHeight
    if (ratio && Number.isFinite(ratio)) {
      setAspectRatio(ratio)
    }
    if (naturalWidth && naturalHeight && (!attrs.width || !attrs.height)) {
      props.setAttrs({ width: naturalWidth, height: naturalHeight })
    }
  }

  return (
    <ResizableRoot
      width={attrs.width ?? undefined}
      height={attrs.height ?? undefined}
      aspectRatio={aspectRatio}
      onMouseDown={() => props.view.focus()}
      onResizeEnd={event => props.setAttrs(event.detail)}
      data-selected={props.selected ? '' : undefined}
      {...stylex.props(imageViewStyles.resizable, props.selected && imageViewStyles.selected)}
    >
      {url && !error && (
        <img
          src={url}
          onLoad={handleImageLoad}
          alt="upload preview"
          {...stylex.props(imageViewStyles.image)}
        />
      )}
      {uploading && !error && (
        <div {...stylex.props(imageViewStyles.overlay)}>
          <LoaderCircle aria-hidden="true" size={18} />
          <div>
            {Math.round(progress * 100)}
            %
          </div>
        </div>
      )}
      {error && (
        <div {...stylex.props(imageViewStyles.overlay, imageViewStyles.error)}>
          <ImageOff aria-hidden="true" size={18} />
          <div>
            Failed to upload image
          </div>
        </div>
      )}
      <ResizableHandle
        {...stylex.props(imageViewStyles.handle)}
        position="bottom-right"
      />
    </ResizableRoot>
  )
}
