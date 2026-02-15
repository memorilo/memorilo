import { useCallback, useEffect, useRef } from 'react'
import { setupSidebarSwipeEffect } from '../lib/sidebar-swipe-gesture'

const SIDEBAR_WIDTH_MOBILE = '18rem'

interface UseSidebarSwipeOptions {
  isMobile: boolean
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
}

/**
 * Hook to handle mobile sidebar swipe gestures and overlay click animations:
 * - Open from left edge (≤24px)
 * - Close with swipe left from anywhere when open
 * - Follow-finger drag with smooth animation
 * - Overlay click closes with animation, ignoring immediate close after drag-open
 *
 * Used for side effects only (swipe detection, animation, state updates).
 */
export function useSidebarSwipe({
  isMobile,
  openMobile,
  setOpenMobile,
}: UseSidebarSwipeOptions) {
  const openMobileRef = useRef(openMobile)
  const ignoreNextOverlayCloseRef = useRef(false)
  const dragCloseInProgressRef = useRef(false)
  const overlayCloseInProgressRef = useRef(false)
  const dragOpenInProgressRef = useRef(false)
  const transitionListenerRef = useRef<{ element: HTMLElement, handler: (event: TransitionEvent) => void } | null>(null)
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cachedSidebarWidthRef = useRef(0)

  useEffect(() => {
    openMobileRef.current = openMobile
  }, [openMobile])

  const getElements = useCallback(() => {
    const content = document.querySelector('[data-sidebar="sidebar"][data-mobile="true"]') as HTMLElement | null
    const overlay = document.querySelector('[data-slot="sheet-overlay"]') as HTMLElement | null
    return { content, overlay }
  }, [])

  const clearDragStyles = useCallback(() => {
    const { content, overlay } = getElements()
    if (content) {
      content.style.transition = ''
      content.style.transform = ''
    }
    if (overlay) {
      overlay.style.transition = ''
      overlay.style.opacity = ''
    }
  }, [getElements])

  const restoreAnimations = useCallback(() => {
    const { content, overlay } = getElements()
    if (content) {
      content.style.animation = ''
    }
    if (overlay) {
      overlay.style.animation = ''
    }
  }, [getElements])

  useEffect(() => {
    if (openMobile && !dragOpenInProgressRef.current) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
      clearDragStyles()
      restoreAnimations()
    }
  }, [openMobile, clearDragStyles, restoreAnimations])

  const suppressAnimations = useCallback(() => {
    const { content, overlay } = getElements()
    if (content) {
      content.style.animation = 'none'
    }
    if (overlay) {
      overlay.style.animation = 'none'
    }
  }, [getElements])

  const getSidebarWidth = useCallback(() => {
    if (cachedSidebarWidthRef.current > 0)
      return cachedSidebarWidthRef.current

    const { content } = getElements()
    if (content) {
      const width = content.getBoundingClientRect().width
      if (width > 0) {
        cachedSidebarWidthRef.current = width
        return width
      }
    }

    const remValue = Number.parseFloat(SIDEBAR_WIDTH_MOBILE)
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    cachedSidebarWidthRef.current = Number.isFinite(remValue) ? remValue * rootFontSize : 0
    return cachedSidebarWidthRef.current > 0 ? cachedSidebarWidthRef.current : 288
  }, [getElements])

  const reapplyClosedTransform = useCallback(() => {
    const { content, overlay } = getElements()
    if (!content)
      return

    const width = getSidebarWidth()
    setTimeout(() => {
      requestAnimationFrame(() => {
        content.style.transition = 'none'
        content.style.transform = `translateX(${-width}px)`
        if (overlay) {
          overlay.style.transition = 'none'
          overlay.style.opacity = '0'
        }
      })
    }, 0)
  }, [getElements, getSidebarWidth])

  useEffect(() => {
    if (!isMobile)
      return

    return setupSidebarSwipeEffect({
      openMobileRef,
      setOpenMobile,
      getElements,
      clearDragStyles,
      suppressAnimations,
      reapplyClosedTransform,
      getSidebarWidth,
      ignoreNextOverlayCloseRef,
      dragCloseInProgressRef,
      overlayCloseInProgressRef,
      dragOpenInProgressRef,
      transitionListenerRef,
      transitionTimeoutRef,
      closeTimeoutRef,
    })
  }, [
    isMobile,
    setOpenMobile,
    getElements,
    clearDragStyles,
    restoreAnimations,
    suppressAnimations,
    reapplyClosedTransform,
    getSidebarWidth,
  ])

  return {}
}
