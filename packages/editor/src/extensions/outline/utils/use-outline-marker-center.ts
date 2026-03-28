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

function resolveFirstMeasureElement(content: HTMLElement): HTMLElement | null {
  let current = content.firstElementChild

  while (current instanceof HTMLElement) {
    if (current.hasAttribute('data-node-view-content-react')) {
      current = current.firstElementChild
      continue
    }

    return current
  }

  return null
}

function resolveMeasureContainer(content: HTMLElement): HTMLElement {
  const current = content.firstElementChild

  if (current instanceof HTMLElement && current.hasAttribute('data-node-view-content-react')) {
    return current
  }

  return content
}

export function measureDefaultParagraphCenterY(wrapper: HTMLElement): number | null {
  const content = wrapper.querySelector<HTMLElement>('[data-node-view-content]')
  const measureTarget = content ? resolveMeasureContainer(content) : wrapper

  const targets = [
    measureTarget,
    wrapper.closest('.ProseMirror'),
  ]

  for (const target of targets) {
    if (!(target instanceof HTMLElement)) {
      continue
    }

    const lineHeight = Number.parseFloat(window.getComputedStyle(target).lineHeight)
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      return lineHeight / 2
    }
  }

  return null
}

function setOutlineMarkerCenterY(wrapper: HTMLElement, centerY: number) {
  wrapper.style.setProperty('--outline-marker-center-y', `${centerY}px`)
}

function applyDefaultOutlineMarkerCenterY(wrapper: HTMLElement): boolean {
  const defaultCenterY = measureDefaultParagraphCenterY(wrapper)
  if (defaultCenterY === null) {
    return false
  }

  setOutlineMarkerCenterY(wrapper, defaultCenterY)
  return true
}

function applyOutlineMarkerCenterY(wrapper: HTMLElement, centerY: number | null): boolean {
  if (centerY !== null) {
    setOutlineMarkerCenterY(wrapper, centerY)
    return true
  }

  if (wrapper.style.getPropertyValue('--outline-marker-center-y') !== '') {
    return true
  }

  return applyDefaultOutlineMarkerCenterY(wrapper)
}

function resolveOutlineMarkerCenter(wrapper: HTMLElement): number | null {
  const content = wrapper.querySelector<HTMLElement>('[data-node-view-content]')
  const firstBlock = content ? resolveFirstMeasureElement(content) : null

  if (firstBlock instanceof HTMLElement) {
    return measureFirstLineCenterY(wrapper, firstBlock)
  }

  return measureDefaultParagraphCenterY(wrapper)
}

function measureEmptyBlockCenterY(wrapper: HTMLElement, firstBlock: HTMLElement): number | null {
  const wrapperRect = wrapper.getBoundingClientRect()
  const firstBlockRect = firstBlock.getBoundingClientRect()
  if (firstBlockRect.height <= 0) {
    return null
  }

  return firstBlockRect.top - wrapperRect.top + firstBlockRect.height / 2
}

function measureFirstLineCenterY(wrapper: HTMLElement, firstBlock: HTMLElement): number | null {
  const firstTextNode = findFirstTextNode(firstBlock)
  if (!firstTextNode) {
    return measureEmptyBlockCenterY(wrapper, firstBlock)
  }

  const range = document.createRange()
  range.setStart(firstTextNode, 0)
  range.setEnd(firstTextNode, Math.min(1, firstTextNode.length))

  const lineRect = Array
    .from(range.getClientRects())
    .find(rect => rect.height > 0)

  if (!lineRect) {
    return null
  }

  const wrapperRect = wrapper.getBoundingClientRect()
  return lineRect.top - wrapperRect.top + lineRect.height / 2
}

export function useOutlineMarkerCenterStyle(
  wrapperRef: RefObject<HTMLElement | null>,
  node: PMNode | null,
) {
  const [centerY, setCenterY] = useState<number | null>(null)

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || !wrapper.isConnected) {
      return
    }

    const nextCenterY = resolveOutlineMarkerCenter(wrapper)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setCenterY(currentCenterY => nextCenterY ?? currentCenterY)

    if (nextCenterY !== null) {
      return
    }

    const frame = requestAnimationFrame(() => {
      const deferredCenterY = resolveOutlineMarkerCenter(wrapper)
      setCenterY(currentCenterY => deferredCenterY ?? currentCenterY)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [node, wrapperRef])

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) {
      return
    }

    if (centerY !== null) {
      applyOutlineMarkerCenterY(wrapper, centerY)
      return
    }

    if (applyOutlineMarkerCenterY(wrapper, null)) {
      return
    }

    const frame = requestAnimationFrame(() => {
      applyOutlineMarkerCenterY(wrapper, null)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [centerY, wrapperRef])
}

function setOutlineConnectorTop(wrapper: HTMLElement, top: number) {
  wrapper.style.setProperty('--outline-connector-top', `${top}px`)
}

function applyOutlineConnectorTop(wrapper: HTMLElement, top: number | null): boolean {
  if (top !== null) {
    setOutlineConnectorTop(wrapper, top)
    return true
  }

  return wrapper.style.getPropertyValue('--outline-connector-top') !== ''
}

function resolveOutlineConnectorTop(wrapper: HTMLElement): number | null {
  const firstMarkerButton = wrapper.querySelector<HTMLElement>('.outline-marker-button')
  if (!firstMarkerButton) {
    return null
  }

  const wrapperRect = wrapper.getBoundingClientRect()
  const markerRect = firstMarkerButton.getBoundingClientRect()
  if (markerRect.height <= 0) {
    return null
  }

  // The synthetic subtree-root chrome should start where a normal list chrome
  // starts: at the bottom edge of the root item's marker button.
  return markerRect.bottom - wrapperRect.top
}

export function useOutlineRootConnectorTopStyle(
  wrapperRef: RefObject<HTMLElement | null>,
  node: PMNode | null,
) {
  const [top, setTop] = useState<number | null>(null)

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || !wrapper.isConnected) {
      return
    }

    const nextTop = resolveOutlineConnectorTop(wrapper)
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setTop(currentTop => nextTop ?? currentTop)

    if (nextTop !== null) {
      return
    }

    const frame = requestAnimationFrame(() => {
      const deferredTop = resolveOutlineConnectorTop(wrapper)
      setTop(currentTop => deferredTop ?? currentTop)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [node, wrapperRef])

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) {
      return
    }

    if (top !== null) {
      applyOutlineConnectorTop(wrapper, top)
      return
    }

    if (applyOutlineConnectorTop(wrapper, null)) {
      return
    }

    const frame = requestAnimationFrame(() => {
      applyOutlineConnectorTop(wrapper, null)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [top, wrapperRef])
}
