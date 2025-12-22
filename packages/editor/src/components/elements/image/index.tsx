import type { MouseEvent as ReactMouseEvent, SyntheticEvent as ReactSyntheticEvent } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { ImageElementType } from '../../../slate'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Transforms } from 'slate'
import { ReactEditor, useSlateStatic } from 'slate-react'
import { getEditorMaxWidthPx } from '../../../lib/dom'
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX } from './constants'
import { ImageActions } from './image-actions'
import { ResizeHandles } from './resize-handles'
import { useImageResize } from './use-image-resize'

function getRoundedSize(width: number, height: number) {
  return { width: Math.round(width), height: Math.round(height) }
}

export function Image(props: RenderElementProps) {
  const editor = useSlateStatic()
  const { width, height } = props.element as ImageElementType
  const [loading, setLoading] = useState(true)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const imageBoxRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fallbackSizeRef = useRef<{ width: number, height: number } | null>(null)

  const { draftSize, isResizing, clearDraft, handleResizePointerDown } = useImageResize({
    editor,
    element: props.element as ImageElementType,
    imgRef,
    fallbackSizeRef,
  })

  const setWrapperNode = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node
    const slateRef = (props.attributes as any)?.ref
    if (typeof slateRef === 'function')
      slateRef(node)
    else if (slateRef && typeof slateRef === 'object')
      slateRef.current = node
  }, [props.attributes])

  const getParentMaxWidthPx = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect?.width)
      return null
    return rect.width
  }, [])

  const effectiveSize = useMemo(() => {
    if (isResizing && draftSize)
      return draftSize
    if (width && height)
      return { width, height }
    if (loading)
      return fallbackSizeRef.current
    return fallbackSizeRef.current
  }, [draftSize, height, isResizing, loading, width])

  useEffect(() => {
    const img = imgRef.current
    if (!img || !width || !height)
      return

    const editorMaxWidth = getEditorMaxWidthPx(img)
    if (!editorMaxWidth || width <= editorMaxWidth)
      return

    const scale = editorMaxWidth / width
    const nextWidth = Math.max(MIN_IMAGE_WIDTH_PX, Math.round(width * scale))
    const nextHeight = Math.max(MIN_IMAGE_HEIGHT_PX, Math.round(height * scale))

    const path = ReactEditor.findPath(editor, props.element)
    Transforms.setNodes(editor, { width: nextWidth, height: nextHeight }, { at: path })
    fallbackSizeRef.current = { width: nextWidth, height: nextHeight }
  }, [editor, height, props.element, width])

  const handleDeleteMouseDown = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const path = ReactEditor.findPath(editor, props.element)
    Transforms.removeNodes(editor, { at: path })
  }, [props.element, editor])

  const handleLoad = useCallback((e: ReactSyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    imgRef.current = img
    if (!width || !height) {
      const parentMaxWidth = getParentMaxWidthPx() ?? img.naturalWidth
      const scale = img.naturalWidth > parentMaxWidth ? (parentMaxWidth / img.naturalWidth) : 1
      const nextWidth = Math.max(MIN_IMAGE_WIDTH_PX, Math.round(img.naturalWidth * scale))
      const nextHeight = Math.max(MIN_IMAGE_HEIGHT_PX, Math.round(img.naturalHeight * scale))

      const path = ReactEditor.findPath(editor, props.element)
      Transforms.setNodes(editor, { width: nextWidth, height: nextHeight }, { at: path })
      fallbackSizeRef.current = { width: nextWidth, height: nextHeight }
    }
    setLoading(false)
  }, [editor, getParentMaxWidthPx, height, props.element, width])

  const handleResetMouseDown = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    const img = imgRef.current
    if (!img || !img.naturalWidth || !img.naturalHeight)
      return

    const parentMaxWidth = getParentMaxWidthPx() ?? img.naturalWidth
    const scale = img.naturalWidth > parentMaxWidth ? (parentMaxWidth / img.naturalWidth) : 1
    const nextSize = getRoundedSize(
      Math.max(MIN_IMAGE_WIDTH_PX, img.naturalWidth * scale),
      Math.max(MIN_IMAGE_HEIGHT_PX, img.naturalHeight * scale),
    )

    const path = ReactEditor.findPath(editor, props.element)
    Transforms.setNodes(editor, nextSize, { at: path })
    fallbackSizeRef.current = nextSize
    ReactEditor.focus(editor)
    clearDraft()
  }, [clearDraft, editor, getParentMaxWidthPx, props.element])

  const canReset = Boolean(imgRef.current?.naturalWidth && imgRef.current?.naturalHeight)

  return (
    <div {...props.attributes} ref={setWrapperNode} className="w-full max-w-lg">
      {props.children}
      <div ref={containerRef} className="group relative" contentEditable={false}>
        {loading && (
          <Skeleton
            className="rounded-md"
            style={
              effectiveSize
                ? {
                    width: effectiveSize.width,
                    height: effectiveSize.height,
                  }
                : { height: '300px', width: '100%' }
            }
          />
        )}

        <div
          className={loading ? 'hidden' : 'relative inline-block'}
          style={effectiveSize ? { width: effectiveSize.width, height: effectiveSize.height } : undefined}
          ref={imageBoxRef}
        >
          <img
            contentEditable={false}
            alt="image"
            src={(props.element as ImageElementType).url}
            onLoad={handleLoad}
            className="block select-none"
            draggable={false}
            ref={imgRef}
            style={effectiveSize ? { width: '100%', height: '100%' } : undefined}
          />

          <div
            className="pointer-events-none absolute inset-0 border border-border/70 opacity-0 transition-opacity group-hover:opacity-100"
            style={isResizing ? { opacity: 1 } : undefined}
          />

          <ResizeHandles isResizing={isResizing} onPointerDown={handleResizePointerDown} />

          <ImageActions
            isResizing={isResizing}
            canReset={canReset}
            onResetMouseDown={handleResetMouseDown}
            onDeleteMouseDown={handleDeleteMouseDown}
          />
        </div>
      </div>
    </div>
  )
}
