import { useCallback, useEffect, useRef } from 'react'

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

  // Clear stale inline styles when opening via button (not drag-open)
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

  // Mobile swipe gestures (open from edge, close anywhere) with follow-finger drag
  useEffect(() => {
    if (!isMobile)
      return

    const supportsPointerEvents = typeof PointerEvent !== 'undefined'
    const supportsTouchEvents = typeof TouchEvent !== 'undefined'
    let startX = 0
    let startY = 0
    let isDragging = false
    let dragMode: 'opening' | 'closing' | null = null
    let openedForDrag = false
    let lastProgress = openMobileRef.current ? 1 : 0
    let lastCoords: { x: number, y: number } | null = null
    let activePointerId: number | null = null
    let activePointerTarget: Element | null = null

    const isOverlayOpen = () => {
      // Only gate on dialog overlay, not our own sheet overlay
      return document.querySelector('[data-slot="dialog-overlay"]') !== null
    }

    // Safe coordinate extraction for PointerEvent and TouchEvent
    const getCoordinates = (event: PointerEvent | TouchEvent): { x: number, y: number } | null => {
      if (supportsPointerEvents && event instanceof PointerEvent) {
        return { x: event.clientX, y: event.clientY }
      }
      if (supportsTouchEvents && event instanceof TouchEvent) {
        const touch = event.touches[0] ?? event.changedTouches[0]
        if (!touch)
          return null
        return { x: touch.clientX, y: touch.clientY }
      }
      return null
    }

    const applyDragTransform = (progress: number) => {
      const { content, overlay } = getElements()
      if (!content)
        return

      const clampedProgress = Math.max(0, Math.min(1, progress))
      lastProgress = clampedProgress
      const width = getSidebarWidth()
      const translateX = (clampedProgress - 1) * width

      content.style.transition = 'none'
      content.style.transform = `translateX(${translateX}px)`

      if (overlay) {
        overlay.style.transition = 'none'
        overlay.style.opacity = String(clampedProgress)
      }
    }

    const animateToFinal = (targetProgress: number, onComplete: () => void) => {
      const { content, overlay } = getElements()
      if (!content) {
        onComplete()
        return
      }

      const width = getSidebarWidth()
      const targetTranslateX = (targetProgress - 1) * width

      content.style.transition = 'transform 200ms ease-in-out'
      content.style.transform = `translateX(${targetTranslateX}px)`

      if (overlay) {
        overlay.style.transition = 'opacity 200ms ease-in-out'
        overlay.style.opacity = String(targetProgress)
      }

      let completed = false
      const finish = () => {
        if (completed)
          return
        completed = true
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current)
          transitionTimeoutRef.current = null
        }
        if (transitionListenerRef.current) {
          transitionListenerRef.current.element.removeEventListener('transitionend', transitionListenerRef.current.handler)
          transitionListenerRef.current = null
        }
        onComplete()
      }
      const handleTransitionEnd = (e: TransitionEvent) => {
        if (e.target === content && e.propertyName === 'transform') {
          finish()
        }
      }

      if (transitionListenerRef.current) {
        transitionListenerRef.current.element.removeEventListener('transitionend', transitionListenerRef.current.handler)
      }

      transitionListenerRef.current = { element: content, handler: handleTransitionEnd }
      // eslint-disable-next-line react-web-api/no-leaked-event-listener
      content.addEventListener('transitionend', handleTransitionEnd, { once: true })

      transitionTimeoutRef.current = setTimeout(() => {
        finish()
      }, 250)
    }

    const resetDragState = () => {
      isDragging = false
      dragMode = null
      openedForDrag = false
      dragOpenInProgressRef.current = false
      lastCoords = null
      lastProgress = openMobileRef.current ? 1 : 0
      if (activePointerTarget && activePointerId !== null && activePointerTarget.hasPointerCapture?.(activePointerId)) {
        activePointerTarget.releasePointerCapture(activePointerId)
      }
      activePointerTarget = null
      activePointerId = null
      cachedSidebarWidthRef.current = 0
    }

    const resolveReleaseOnOverlay = (coords: { x: number, y: number } | null) => {
      if (!coords)
        return false
      const releaseTarget = document.elementFromPoint(coords.x, coords.y)
      return releaseTarget instanceof Element
        ? releaseTarget.closest('[data-slot="sheet-overlay"]') !== null
        : false
    }

    const handlePointerDown = (event: PointerEvent | TouchEvent) => {
      if (isOverlayOpen())
        return

      const coords = getCoordinates(event)
      if (!coords)
        return

      lastCoords = coords

      if (supportsPointerEvents && event instanceof PointerEvent) {
        activePointerId = event.pointerId
        const target = event.target
        if (target instanceof Element && typeof target.setPointerCapture === 'function') {
          target.setPointerCapture(event.pointerId)
          activePointerTarget = target
        }
      }

      startX = coords.x
      startY = coords.y
      isDragging = false
      dragMode = null
      openedForDrag = false
      lastProgress = openMobileRef.current ? 1 : 0

      // Determine if this could be an opening or closing gesture
      if (!openMobileRef.current && startX <= 24) {
        // Potential opening gesture
        dragMode = 'opening'
      }
      else if (openMobileRef.current) {
        // Potential closing gesture
        dragMode = 'closing'
      }
    }

    const handlePointerMove = (event: PointerEvent | TouchEvent) => {
      if (!dragMode)
        return
      if (supportsPointerEvents && event instanceof PointerEvent && event.buttons === 0)
        return
      if (supportsTouchEvents && event instanceof TouchEvent && event.touches.length === 0)
        return
      if (isOverlayOpen()) {
        clearDragStyles()
        resetDragState()
        return
      }

      const coords = getCoordinates(event)
      if (!coords)
        return

      lastCoords = coords

      if (supportsPointerEvents && event instanceof PointerEvent && activePointerId !== null && event.pointerId !== activePointerId)
        return

      const dx = coords.x - startX
      const dy = coords.y - startY

      // Start dragging once we detect horizontal dominance
      if (!isDragging && Math.abs(dx) > Math.abs(dy)) {
        isDragging = true

        if (dragMode === 'opening' && !openMobileRef.current && !openedForDrag) {
          openedForDrag = true
          dragOpenInProgressRef.current = true
          suppressAnimations()
          setOpenMobile(true)
        }
      }

      if (!isDragging)
        return

      const width = getSidebarWidth()
      if (!width)
        return

      let progress = 0
      if (dragMode === 'opening') {
        // Opening: progress from 0 to 1 as dx increases
        progress = dx / width
      }
      else if (dragMode === 'closing') {
        progress = 1 + (dx / width)
      }

      applyDragTransform(progress)
    }

    const handlePointerEnd = (event: PointerEvent | TouchEvent) => {
      if (!dragMode)
        return

      if (supportsPointerEvents && event instanceof PointerEvent && activePointerId !== null && event.pointerId !== activePointerId)
        return

      const currentDragMode = dragMode
      const wasDragging = isDragging

      const coords = getCoordinates(event)
      const resolvedCoords = coords ?? lastCoords
      if (!resolvedCoords) {
        const targetProgress = lastProgress >= 0.5 ? 1 : 0
        const releaseOnOverlay = resolveReleaseOnOverlay(lastCoords)
        if (targetProgress === 0) {
          dragCloseInProgressRef.current = true
          suppressAnimations()
          animateToFinal(0, () => {
            setOpenMobile(false)
            reapplyClosedTransform()
            closeTimeoutRef.current = setTimeout(() => {
              dragCloseInProgressRef.current = false
              resetDragState()
              closeTimeoutRef.current = null
            }, 200)
          })
        }
        else {
          dragOpenInProgressRef.current = true
          clearDragStyles()
          restoreAnimations()
          ignoreNextOverlayCloseRef.current = releaseOnOverlay
          animateToFinal(1, () => {
            dragOpenInProgressRef.current = false
            resetDragState()
            ignoreNextOverlayCloseRef.current = false
          })
          setOpenMobile(true)
        }
        return
      }

      const dx = resolvedCoords.x - startX
      const dy = resolvedCoords.y - startY

      if (isOverlayOpen()) {
        clearDragStyles()
        resetDragState()
        return
      }

      if (!wasDragging) {
        clearDragStyles()
        resetDragState()
        return
      }

      const isHorizontal = Math.abs(dx) > Math.abs(dy)
      let targetProgress: 0 | 1 | null = null

      if (isHorizontal) {
        if (currentDragMode === 'opening') {
          if (startX <= 24 && dx >= 30) {
            targetProgress = 1
          }
          else if (openedForDrag) {
            targetProgress = 0
          }
        }
        else if (currentDragMode === 'closing') {
          const width = getSidebarWidth()
          const rawProgress = width
            ? 1 + (dx / width)
            : lastProgress
          const normalizedProgress = Math.max(0, Math.min(1, Number.isFinite(rawProgress) ? rawProgress : lastProgress))
          targetProgress = normalizedProgress <= 0.5 ? 0 : 1
        }
      }
      else if (currentDragMode === 'opening' && openedForDrag) {
        targetProgress = 0
      }

      if (targetProgress === null) {
        clearDragStyles()
        resetDragState()
        return
      }

      if (targetProgress === 0) {
        // Mark drag-close as in-progress to prevent CSS animation re-apply
        dragCloseInProgressRef.current = true

        // Suppress Sheet CSS animations to prevent bounce during close
        suppressAnimations()

        animateToFinal(0, () => {
          setOpenMobile(false)
          reapplyClosedTransform()
          // Keep animations suppressed until next open
          // Inline styles will be cleared on next open
          closeTimeoutRef.current = setTimeout(() => {
            dragCloseInProgressRef.current = false
            resetDragState()
            closeTimeoutRef.current = null
          }, 200)
        })
      }
      else {
        // Mark drag-open as in-progress to prevent style clearing until animation completes
        dragOpenInProgressRef.current = true
        // Clear drag styles and restore animations before opening
        clearDragStyles()
        restoreAnimations()
        // Set suppression flag when drag-open completes successfully
        const releaseOnOverlay = resolveReleaseOnOverlay(resolvedCoords)
        ignoreNextOverlayCloseRef.current = releaseOnOverlay
        animateToFinal(1, () => {
          dragOpenInProgressRef.current = false
          resetDragState()
          ignoreNextOverlayCloseRef.current = false
        })
        setOpenMobile(true)
      }
    }

    if (supportsPointerEvents) {
      window.addEventListener('pointerdown', handlePointerDown as EventListener, { passive: true })
      window.addEventListener('pointermove', handlePointerMove as EventListener, { passive: true })
      window.addEventListener('pointerup', handlePointerEnd as EventListener, { passive: true })
      window.addEventListener('pointercancel', handlePointerEnd as EventListener, { passive: true })
    }
    else if (supportsTouchEvents) {
      window.addEventListener('touchstart', handlePointerDown as EventListener, { passive: true })
      window.addEventListener('touchmove', handlePointerMove as EventListener, { passive: true })
      window.addEventListener('touchend', handlePointerEnd as EventListener, { passive: true })
      window.addEventListener('touchcancel', handlePointerEnd as EventListener, { passive: true })
    }

    const handleOverlayClick = (event: Event) => {
      // Detect overlay click using instanceof and closest()
      const target = event.target
      if (!(target instanceof Element))
        return

      const overlay = target.closest('[data-slot="sheet-overlay"]')
      if (!overlay)
        return

      if (dragOpenInProgressRef.current) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      // If ignoreNextOverlayCloseRef is set, prevent Base UI from closing immediately
      if (ignoreNextOverlayCloseRef.current) {
        ignoreNextOverlayCloseRef.current = false
        event.preventDefault()
        event.stopPropagation()
        return
      }

      // If drag-close or overlay-close is in progress, prevent Base UI from closing immediately
      if (dragCloseInProgressRef.current || overlayCloseInProgressRef.current) {
        event.preventDefault()
        event.stopPropagation()
        return
      }

      // Only proceed if sidebar is open
      if (!openMobileRef.current)
        return

      // Mark overlay-close as in-progress to prevent re-entry
      overlayCloseInProgressRef.current = true
      suppressAnimations()

      animateToFinal(0, () => {
        setOpenMobile(false)
        reapplyClosedTransform()
        closeTimeoutRef.current = setTimeout(() => {
          overlayCloseInProgressRef.current = false
          closeTimeoutRef.current = null
        }, 200)
      })

      event.preventDefault()
      event.stopPropagation()
    }

    if (supportsPointerEvents) {
      window.addEventListener('pointerdown', handleOverlayClick, { capture: true, passive: false })
      window.addEventListener('click', handleOverlayClick, { capture: true, passive: false })
    }
    else if (supportsTouchEvents) {
      window.addEventListener('touchstart', handleOverlayClick, { capture: true, passive: false })
      window.addEventListener('click', handleOverlayClick, { capture: true, passive: false })
    }

    return () => {
      if (supportsPointerEvents) {
        window.removeEventListener('pointerdown', handlePointerDown)
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerEnd)
        window.removeEventListener('pointercancel', handlePointerEnd)
      }
      else if (supportsTouchEvents) {
        window.removeEventListener('touchstart', handlePointerDown)
        window.removeEventListener('touchmove', handlePointerMove)
        window.removeEventListener('touchend', handlePointerEnd)
        window.removeEventListener('touchcancel', handlePointerEnd)
      }
      if (supportsPointerEvents) {
        window.removeEventListener('pointerdown', handleOverlayClick, { capture: true })
        window.removeEventListener('click', handleOverlayClick, { capture: true })
      }
      else if (supportsTouchEvents) {
        window.removeEventListener('touchstart', handleOverlayClick, { capture: true })
        window.removeEventListener('click', handleOverlayClick, { capture: true })
      }
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current)
        transitionTimeoutRef.current = null
      }
      if (transitionListenerRef.current) {
        transitionListenerRef.current.element.removeEventListener('transitionend', transitionListenerRef.current.handler)
        transitionListenerRef.current = null
      }
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
    }
  }, [isMobile, setOpenMobile, getElements, clearDragStyles, restoreAnimations, reapplyClosedTransform, getSidebarWidth, suppressAnimations])

  return {}
}
