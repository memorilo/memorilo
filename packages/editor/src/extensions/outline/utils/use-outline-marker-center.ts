import type { Node as PMNode } from '@tiptap/pm/model'
import type { RefObject } from 'react'
import { useLayoutEffect, useState } from 'react'

function findFirstTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    if (textNode.length > 0) {
      return textNode
    }
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    const firstText = findFirstTextNode(child)
    if (firstText) {
      return firstText
    }
  }

  return null
}

function measureFirstLineCenterY(wrapper: HTMLElement, firstBlock: HTMLElement): number | null {
  const range = document.createRange()
  const firstTextNode = findFirstTextNode(firstBlock)

  if (firstTextNode) {
    range.setStart(firstTextNode, 0)
    range.setEnd(firstTextNode, Math.min(1, firstTextNode.length))
  }
  else {
    range.selectNodeContents(firstBlock)
  }

  const lineRect = Array
    .from(range.getClientRects())
    .find(rect => rect.height > 0)

  if (!lineRect) {
    return null
  }

  const wrapperRect = wrapper.getBoundingClientRect()
  return lineRect.top - wrapperRect.top + lineRect.height / 2
}

export function useOutlineMarkerCenter(
  wrapperRef: RefObject<HTMLElement | null>,
  node: PMNode,
) {
  const [centerY, setCenterY] = useState<number | null>(null)

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || !wrapper.isConnected) {
      return
    }

    let disposed = false

    const measure = () => {
      const content = wrapper.querySelector<HTMLElement>('[data-node-view-content]')
      const firstBlock = content?.firstElementChild
      if (!(firstBlock instanceof HTMLElement)) {
        if (!disposed) {
          // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
          setCenterY(null)
        }
        return
      }

      const nextCenterY = measureFirstLineCenterY(wrapper, firstBlock)
      if (disposed) {
        return
      }
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setCenterY(nextCenterY)
    }

    measure()
    const frame = requestAnimationFrame(measure)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
    }
  }, [node, wrapperRef])

  return centerY
}
