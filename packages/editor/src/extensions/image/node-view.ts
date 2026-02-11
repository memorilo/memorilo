import { ResizableNodeView } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import { ImageContent } from './node-view-content'

function applySizeFromNode(el: HTMLElement, pmNode: any) {
  const width = pmNode.attrs?.width as number | null | undefined
  const height = pmNode.attrs?.height as number | null | undefined

  if (typeof width === 'number' && Number.isFinite(width)) {
    el.style.width = `${width}px`
  }
  else {
    el.style.removeProperty('width')
  }

  if (typeof height === 'number' && Number.isFinite(height)) {
    el.style.height = `${height}px`
  }
  else {
    el.style.removeProperty('height')
  }
}

function viewPropsFromNode(pmNode: any, HTMLAttributes: Record<string, any>) {
  const attrs = pmNode.attrs ?? {}
  const width = attrs.width as number | null | undefined
  const height = attrs.height as number | null | undefined
  const explicitSize = (typeof width === 'number' && Number.isFinite(width))
    || (typeof height === 'number' && Number.isFinite(height))

  return {
    assetId: typeof attrs.assetId === 'string' ? attrs.assetId : null,
    uploadId: typeof attrs.uploadId === 'string' ? attrs.uploadId : null,
    // Used by the UI to render a failure placeholder when an async asset task fails.
    uploadError: typeof attrs.uploadError === 'string' ? attrs.uploadError : null,
    src: typeof attrs.src === 'string' ? attrs.src : null,
    alt: typeof attrs.alt === 'string' ? attrs.alt : null,
    explicitSize,
    baseImgClassName: typeof HTMLAttributes?.class === 'string' ? HTMLAttributes.class : undefined,
  }
}

export function createImageNodeView(params: { resize: unknown }) {
  if (typeof document === 'undefined') {
    return null
  }

  const resize = params.resize as any
  const resizeEnabled = resize?.enabled ?? false
  const resizeOptions = resizeEnabled ? resize : null

  return ({ node, getPos, HTMLAttributes, editor }: any) => {
    const renderer = new ReactRenderer(ImageContent, {
      editor,
      as: 'div',
      props: viewPropsFromNode(node, HTMLAttributes ?? {}),
    })
    renderer.element.contentEditable = 'false'
    applySizeFromNode(renderer.element, node)

    if (!resizeEnabled) {
      return {
        dom: renderer.element,
        update: (updatedNode: any) => {
          if (updatedNode.type !== node.type) {
            return false
          }
          applySizeFromNode(renderer.element, updatedNode)
          renderer.updateProps(viewPropsFromNode(updatedNode, HTMLAttributes ?? {}))
          return true
        },
        destroy: () => {
          renderer.destroy()
        },
      }
    }

    const { directions, minWidth, minHeight, alwaysPreserveAspectRatio } = resizeOptions ?? {}

    const resizable = new ResizableNodeView({
      element: renderer.element,
      editor,
      node,
      getPos,
      onResize: (width, height) => {
        renderer.element.style.width = `${width}px`
        renderer.element.style.height = `${height}px`
      },
      onCommit: (width, height) => {
        const pos = getPos()
        if (pos === undefined) {
          return
        }

        editor
          .chain()
          .setNodeSelection(pos)
          .updateAttributes('image', {
            width,
            height,
          })
          .run()
      },
      onUpdate: (updatedNode) => {
        applySizeFromNode(renderer.element, updatedNode)
        renderer.updateProps(viewPropsFromNode(updatedNode, HTMLAttributes ?? {}))
        return true
      },
      options: {
        directions,
        min: {
          width: minWidth,
          height: minHeight,
        },
        preserveAspectRatio: alwaysPreserveAspectRatio ?? false,
      },
    })

    return {
      dom: resizable.dom,
      update: resizable.update.bind(resizable),
      destroy: () => {
        renderer.destroy()
        resizable.destroy()
      },
    }
  }
}
