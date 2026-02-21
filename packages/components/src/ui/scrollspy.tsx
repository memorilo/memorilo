import type { ReactNode, RefObject } from 'react'
import { useCallback, useEffect, useRef } from 'react'

interface ScrollspyProps {
  children: ReactNode
  targetRef?: RefObject<HTMLElement | HTMLDivElement | Document | null | undefined>
  onUpdate?: (id: string) => void
  offset?: number
  smooth?: boolean
  className?: string
  dataAttribute?: string
  history?: boolean
  throttleTime?: number
}

export function Scrollspy({
  children,
  targetRef,
  onUpdate,
  className,
  offset = 0,
  smooth = true,
  dataAttribute = 'scrollspy',
  history = true,
}: ScrollspyProps) {
  const selfRef = useRef<HTMLDivElement | null>(null)
  const anchorElementsRef = useRef<HTMLElement[] | null>(null)
  const prevIdTracker = useRef<string | null>(null)

  const scrollActiveAnchorIntoView = useCallback((sectionId: string, behavior: ScrollBehavior) => {
    const container = selfRef.current
    if (!container || !anchorElementsRef.current)
      return
    const activeAnchor = anchorElementsRef.current.find(
      item => item.getAttribute(`data-${dataAttribute}-anchor`) === sectionId,
    )
    if (!activeAnchor)
      return

    const containerRect = container.getBoundingClientRect()
    const anchorRect = activeAnchor.getBoundingClientRect()

    let nextLeft = container.scrollLeft
    let nextTop = container.scrollTop

    if (container.scrollWidth > container.clientWidth) {
      if (anchorRect.left < containerRect.left) {
        nextLeft -= containerRect.left - anchorRect.left
      }
      else if (anchorRect.right > containerRect.right) {
        nextLeft += anchorRect.right - containerRect.right
      }
    }

    if (container.scrollHeight > container.clientHeight) {
      if (anchorRect.top < containerRect.top) {
        nextTop -= containerRect.top - anchorRect.top
      }
      else if (anchorRect.bottom > containerRect.bottom) {
        nextTop += anchorRect.bottom - containerRect.bottom
      }
    }

    if (nextLeft !== container.scrollLeft || nextTop !== container.scrollTop) {
      container.scrollTo({
        left: nextLeft,
        top: nextTop,
        behavior,
      })
    }
  }, [dataAttribute])

  // Sets active nav, hash, prevIdTracker, and calls onUpdate
  const setActiveSection = useCallback(
    (sectionId: string | null, force = false) => {
      if (!sectionId)
        return
      const shouldScrollNav = force || prevIdTracker.current !== sectionId
      const scrollBehavior: ScrollBehavior = force && smooth ? 'smooth' : 'auto'
      anchorElementsRef.current?.forEach((item) => {
        const id = item.getAttribute(`data-${dataAttribute}-anchor`)
        if (id === sectionId) {
          item.setAttribute('data-active', 'true')
        }
        else {
          item.removeAttribute('data-active')
        }
      })
      if (onUpdate)
        onUpdate(sectionId)
      if (history && (force || prevIdTracker.current !== sectionId)) {
        window.history.replaceState({}, '', `#${sectionId}`)
      }
      if (shouldScrollNav) {
        scrollActiveAnchorIntoView(sectionId, scrollBehavior)
      }
      prevIdTracker.current = sectionId
    },
    [anchorElementsRef, dataAttribute, history, onUpdate, scrollActiveAnchorIntoView, smooth],
  )

  const handleScroll = useCallback(() => {
    if (!anchorElementsRef.current || anchorElementsRef.current.length === 0)
      return
    const scrollElement = targetRef?.current === document ? window : targetRef?.current
    if (!scrollElement)
      return
    const scrollTop
      = scrollElement === window
        ? window.scrollY || document.documentElement.scrollTop
        : (scrollElement as HTMLElement).scrollTop

    // Find the anchor whose section is closest to but not past the top
    let activeIdx = 0
    let minDelta = Infinity
    anchorElementsRef.current.forEach((anchor, idx) => {
      const sectionId = anchor.getAttribute(`data-${dataAttribute}-anchor`)
      const sectionElement = document.getElementById(sectionId!)
      if (!sectionElement)
        return
      const sectionTop = scrollElement === window
        ? sectionElement.getBoundingClientRect().top + scrollTop
        : sectionElement.getBoundingClientRect().top - (scrollElement as HTMLElement).getBoundingClientRect().top + scrollTop
      let customOffset = offset
      const dataOffset = anchor.getAttribute(`data-${dataAttribute}-offset`)
      if (dataOffset)
        customOffset = Number.parseInt(dataOffset, 10)
      const delta = Math.abs(sectionTop - customOffset - scrollTop)
      if (sectionTop - customOffset <= scrollTop && delta < minDelta) {
        minDelta = delta
        activeIdx = idx
      }
    })

    // If at bottom, force last anchor
    if (scrollElement) {
      const scrollHeight
        = scrollElement === window ? document.documentElement.scrollHeight : (scrollElement as HTMLElement).scrollHeight
      const clientHeight = scrollElement === window ? window.innerHeight : (scrollElement as HTMLElement).clientHeight
      if (scrollHeight - clientHeight > 1 && scrollTop + clientHeight >= scrollHeight - 2) {
        activeIdx = anchorElementsRef.current.length - 1
      }
    }

    // Set only one anchor active and sync the URL hash
    const activeAnchor = anchorElementsRef.current[activeIdx]
    const sectionId = activeAnchor?.getAttribute(`data-${dataAttribute}-anchor`) || null
    setActiveSection(sectionId)
    // Remove data-active from all others
    anchorElementsRef.current.forEach((item, idx) => {
      if (idx !== activeIdx) {
        item.removeAttribute('data-active')
      }
    })
  }, [anchorElementsRef, targetRef, dataAttribute, offset, setActiveSection])

  const scrollTo = useCallback(
    (anchorElement: HTMLElement) => (event?: Event) => {
      if (event)
        event.preventDefault()
      const sectionId = anchorElement.getAttribute(`data-${dataAttribute}-anchor`)?.replace('#', '') || null
      if (!sectionId)
        return
      const sectionElement = document.getElementById(sectionId)
      if (!sectionElement)
        return

      const scrollToElement = targetRef?.current === document ? window : targetRef?.current
      if (!scrollToElement)
        return

      let customOffset = offset
      const dataOffset = anchorElement.getAttribute(`data-${dataAttribute}-offset`)
      if (dataOffset) {
        customOffset = Number.parseInt(dataOffset, 10)
      }

      const scrollTop = scrollToElement === window
        ? sectionElement.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop) - customOffset
        : sectionElement.getBoundingClientRect().top - (scrollToElement as HTMLElement).getBoundingClientRect().top + (scrollToElement as HTMLElement).scrollTop - customOffset

      if (scrollToElement && 'scrollTo' in scrollToElement) {
        scrollToElement.scrollTo({
          top: scrollTop,
          left: 0,
          behavior: smooth ? 'smooth' : 'auto',
        })
      }
      setActiveSection(sectionId, true)
    },
    [dataAttribute, offset, smooth, targetRef, setActiveSection],
  )

  // Scroll to the section if the ID is present in the URL hash
  const scrollToHashSection = useCallback(() => {
    if (!history)
      return
    const hash = CSS.escape(window.location.hash.replace('#', ''))

    if (hash) {
      const targetElement = document.querySelector(`[data-${dataAttribute}-anchor="${hash}"]`) as HTMLElement
      if (targetElement) {
        scrollTo(targetElement)()
      }
    }
  }, [dataAttribute, scrollTo, history])

  useEffect(() => {
    // Query elements and store them in the ref, avoiding unnecessary re-renders
    if (selfRef.current) {
      anchorElementsRef.current = Array.from(
        selfRef.current.querySelectorAll<HTMLElement>(`[data-${dataAttribute}-anchor]`),
      )
    }

    const clickHandlers = new Map<HTMLElement, EventListener>()
    anchorElementsRef.current?.forEach((item) => {
      const handler = scrollTo(item as HTMLElement) as EventListener
      clickHandlers.set(item, handler)
      item.addEventListener('click', handler)
    })

    const scrollElement = targetRef?.current === document ? window : targetRef?.current

    // Attach the scroll event to the correct scrollable element
    scrollElement?.addEventListener('scroll', handleScroll)

    // Check if there's a hash in the URL and scroll to the corresponding section
    let highlightTimeout: number | null = null
    const hashTimeout = window.setTimeout(() => {
      scrollToHashSection()
      // Wait for scroll to settle, then update nav highlighting
      highlightTimeout = window.setTimeout(() => {
        handleScroll()
      }, 100)
    }, 100) // Adding a slight delay to ensure content is fully rendered

    return () => {
      scrollElement?.removeEventListener('scroll', handleScroll)
      clickHandlers.forEach((handler, item) => {
        item.removeEventListener('click', handler)
      })
      window.clearTimeout(hashTimeout)
      if (highlightTimeout !== null) {
        window.clearTimeout(highlightTimeout)
      }
    }
  }, [targetRef, selfRef, handleScroll, dataAttribute, scrollTo, scrollToHashSection])

  return (
    <div data-slot="scrollspy" className={className} ref={selfRef}>
      {children}
    </div>
  )
}
