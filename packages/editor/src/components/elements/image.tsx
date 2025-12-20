import type { RenderElementProps } from 'slate-react'
import type { ImageElementType } from '../../slate'
import { DeleteIcon } from '@memorilo/components/ui/animiated-icons/delete'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { useCallback, useState } from 'react'
import { Transforms } from 'slate'
import { ReactEditor, useSlateStatic } from 'slate-react'
import { UtilButton } from '../util-button'

export function Image(props: RenderElementProps) {
  const editor = useSlateStatic()
  const { width, height } = props.element as ImageElementType
  const [loading, setLoading] = useState(true)

  const handleDeleteMouseDown = useCallback(() => {
    const path = ReactEditor.findPath(editor, props.element)
    Transforms.removeNodes(editor, { at: path })
  }, [props.element, editor])

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    setLoading(false)
    const img = e.currentTarget
    if (!width || !height) {
      const path = ReactEditor.findPath(editor, props.element)
      Transforms.setNodes(editor, {
        width: img.naturalWidth,
        height: img.naturalHeight,
      }, { at: path })
    }
  }, [editor, props.element, width, height])

  return (
    <div {...props.attributes} className="max-w-lg">
      {props.children}
      <div className="group relative flex flex-col" contentEditable={false}>
        {loading && (
          <Skeleton
            className="rounded-md"
            style={
              width && height
                ? {
                    maxWidth: width,
                    aspectRatio: `${width} / ${height}`,
                    width: '100%',
                  }
                : { height: '300px', width: '100%' }
            }
          />
        )}
        <img
          contentEditable={false}
          alt="image"
          src={(props.element as ImageElementType).url}
          onLoad={handleLoad}
          className={loading ? 'hidden' : 'block'}
          style={
            width && height
              ? {
                  maxWidth: width,
                  aspectRatio: `${width} / ${height}`,
                  width: '100%',
                }
              : undefined
          }
        />
        <UtilButton
        // Make the control non-editable so Slate doesn't treat it as content
          contentEditable={false}
          onMouseDown={handleDeleteMouseDown}
          className="absolute top-3 left-3 z-50 hidden text-sm group-hover:block"
        >
          <DeleteIcon size={16} />
        </UtilButton>
      </div>
    </div>
  )
}
