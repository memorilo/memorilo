import type { MutableRefObject } from 'react'

interface SidebarElements {
  content: HTMLElement | null
  overlay: HTMLElement | null
}

interface TransitionListener {
  element: HTMLElement
  handler: (event: TransitionEvent) => void
}

export interface SidebarSwipeEffectOptions {
  openMobileRef: MutableRefObject<boolean>
  setOpenMobile: (open: boolean) => void
  getElements: () => SidebarElements
  clearDragStyles: () => void
  suppressAnimations: () => void
  reapplyClosedTransform: () => void
  getSidebarWidth: () => number
  ignoreNextOverlayCloseRef: MutableRefObject<boolean>
  dragCloseInProgressRef: MutableRefObject<boolean>
  overlayCloseInProgressRef: MutableRefObject<boolean>
  dragOpenInProgressRef: MutableRefObject<boolean>
  transitionListenerRef: MutableRefObject<TransitionListener | null>
  transitionTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  closeTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
}

export function setupSidebarSwipeEffect({
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
}: SidebarSwipeEffectOptions) {
  const OPEN_ZONE_START = 0
  const OPEN_ZONE_WIDTH = 72
  const OPEN_ZONE_END = OPEN_ZONE_START + OPEN_ZONE_WIDTH
  const supportsPointerEvents = typeof PointerEvent !== 'undefined'
  const supportsTouchEvents = typeof TouchEvent !== 'undefined'
  const CLICK_SUPPRESSION_MS = 700
  let startX = 0
  let startY = 0
  let isDragging = false
  let dragMode: 'opening' | 'closing' | null = null
  let openedForDrag = false
  let activePointerId: number | null = null
  let activePointerTarget: Element | null = null
  let pendingOpenProgress: number | null = null
  let pendingOpenFrame: number | null = null
  let pendingOpenTries = 0
  let suppressClickUntil = 0

  const isOverlayOpen = () => {
    return document.querySelector('[data-slot="dialog-overlay"]') !== null
  }

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

  const markTouchInteraction = (event: Event) => {
    if (supportsPointerEvents && event instanceof PointerEvent) {
      if (event.pointerType === 'touch')
        suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS
      return
    }
    if (supportsTouchEvents && event instanceof TouchEvent)
      suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS
  }

  const shouldSuppressClick = (event: Event) => {
    return event.type === 'click' && Date.now() < suppressClickUntil
  }

  const applyDragTransform = (progress: number) => {
    const { content, overlay } = getElements()
    if (!content)
      return

    const clampedProgress = Math.max(0, Math.min(1, progress))
    const width = getSidebarWidth()
    const translateX = (clampedProgress - 1) * width

    content.style.transition = 'none'
    content.style.transform = `translateX(${translateX}px)`

    if (overlay) {
      overlay.style.transition = 'none'
      overlay.style.opacity = String(clampedProgress)
    }
  }

  const scheduleOpenSync = (progress: number) => {
    pendingOpenProgress = Math.max(0, Math.min(1, progress))
    if (pendingOpenFrame !== null)
      return
    pendingOpenTries = 0
    const syncFrame = () => {
      pendingOpenFrame = requestAnimationFrame(() => {
        pendingOpenFrame = null
        if (pendingOpenProgress === null || !isDragging || dragMode !== 'opening') {
          pendingOpenProgress = null
          return
        }
        const { content } = getElements()
        if (!content && pendingOpenTries < 3) {
          pendingOpenTries += 1
          syncFrame()
          return
        }
        if (!content)
          return
        suppressAnimations()
        applyDragTransform(pendingOpenProgress)
        pendingOpenProgress = null
      })
    }
    syncFrame()
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
    pendingOpenProgress = null
    if (pendingOpenFrame !== null) {
      cancelAnimationFrame(pendingOpenFrame)
      pendingOpenFrame = null
    }
    pendingOpenTries = 0
    if (activePointerTarget && activePointerId !== null && activePointerTarget.hasPointerCapture?.(activePointerId)) {
      activePointerTarget.releasePointerCapture(activePointerId)
    }
    activePointerTarget = null
    activePointerId = null
  }

  const resolveReleaseOnOverlay = (coords: { x: number, y: number } | null) => {
    if (!coords)
      return false
    const releaseTarget = document.elementFromPoint(coords.x, coords.y)
    return releaseTarget instanceof Element
      ? releaseTarget.closest('[data-slot="sheet-overlay"]') !== null
      : false
  }

  const closeWithAnimation = (source: 'drag' | 'overlay') => {
    const inProgressRef = source === 'drag' ? dragCloseInProgressRef : overlayCloseInProgressRef
    inProgressRef.current = true
    suppressAnimations()
    animateToFinal(0, () => {
      setOpenMobile(false)
      reapplyClosedTransform()
      closeTimeoutRef.current = setTimeout(() => {
        inProgressRef.current = false
        if (source === 'drag')
          resetDragState()
        closeTimeoutRef.current = null
      }, 200)
    })
  }

  const openWithAnimation = (releaseOnOverlay: boolean) => {
    dragOpenInProgressRef.current = true
    suppressAnimations()
    if (pendingOpenFrame !== null) {
      cancelAnimationFrame(pendingOpenFrame)
      pendingOpenFrame = null
      pendingOpenProgress = null
      pendingOpenTries = 0
    }
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
    ignoreNextOverlayCloseRef.current = releaseOnOverlay
    animateToFinal(1, () => {
      dragOpenInProgressRef.current = false
      resetDragState()
      ignoreNextOverlayCloseRef.current = false
    })
    if (!openMobileRef.current)
      setOpenMobile(true)
  }

  const handlePointerDown = (event: PointerEvent | TouchEvent) => {
    if (isOverlayOpen())
      return

    const coords = getCoordinates(event)
    if (!coords)
      return

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

    if (!openMobileRef.current && startX >= OPEN_ZONE_START && startX <= OPEN_ZONE_END) {
      dragMode = 'opening'
    }
    else if (openMobileRef.current) {
      dragMode = 'closing'
    }
  }

  const handlePointerMove = (event: PointerEvent | TouchEvent) => {
    if (!dragMode)
      return
    if (supportsPointerEvents && event instanceof PointerEvent && event.pointerType === 'mouse' && event.buttons === 0)
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

    if (supportsPointerEvents && event instanceof PointerEvent && activePointerId !== null && event.pointerId !== activePointerId)
      return

    if (overlayCloseInProgressRef.current) {
      resetDragState()
      return
    }

    const dx = coords.x - startX
    const dy = coords.y - startY

    if (!isDragging && Math.abs(dx) > Math.abs(dy)) {
      isDragging = true
      markTouchInteraction(event)

      if (dragMode === 'opening' && !openMobileRef.current && !openedForDrag) {
        openedForDrag = true
        dragOpenInProgressRef.current = true
        suppressAnimations()
        setOpenMobile(true)
        scheduleOpenSync(dx / getSidebarWidth())
      }
    }

    if (!isDragging)
      return

    const width = getSidebarWidth()
    if (!width)
      return

    const progress = dragMode === 'opening' ? dx / width : 1 + (dx / width)
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
    if (!coords) {
      clearDragStyles()
      resetDragState()
      return
    }

    const dx = coords.x - startX
    const dy = coords.y - startY

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
        if (startX >= OPEN_ZONE_START && startX <= OPEN_ZONE_END && dx >= 30) {
          targetProgress = 1
        }
        else if (openedForDrag) {
          targetProgress = 0
        }
      }
      else if (currentDragMode === 'closing') {
        const width = getSidebarWidth()
        const normalizedProgress = Math.max(0, Math.min(1, 1 + (dx / width)))
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

    dragMode = null
    isDragging = false

    if (targetProgress === 0) {
      closeWithAnimation('drag')
    }
    else {
      const releaseOnOverlay = resolveReleaseOnOverlay(coords)
      openWithAnimation(releaseOnOverlay)
    }
  }

  const handleOverlayClick = (event: Event) => {
    if (shouldSuppressClick(event)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (event.type === 'pointerdown' || event.type === 'touchstart')
      markTouchInteraction(event)

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

    if (ignoreNextOverlayCloseRef.current) {
      ignoreNextOverlayCloseRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (dragCloseInProgressRef.current || overlayCloseInProgressRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (!openMobileRef.current)
      return

    resetDragState()
    closeWithAnimation('overlay')

    event.preventDefault()
    event.stopPropagation()
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
}
