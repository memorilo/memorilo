import type { RefObject } from 'react'
import type { EditorSession } from '../common/editor-session'
import type { OutlineOptions } from '../common/outline-runtime'
import * as stylex from '@stylexjs/stylex'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { outlineEditorStyles } from './outline-editor.stylex'
import { observeOutlineMarkerAlignment } from './outline-marker-alignment'
import './outline-content.stylex'

function visibleBlockIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'))
    .filter(element => !element.hidden && element.getClientRects().length > 0)
    .map((element) => {
      const blockId = element.dataset.blockId
      if (!blockId)
        throw new Error('A visible outline block is missing its blockId')
      return blockId
    })
}

function focusLabel(root: HTMLElement | null, blockId: string | null): string | null {
  if (!root || !blockId)
    return null
  const element = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
  const body = element?.querySelector<HTMLElement>(':scope > .list-content > :first-child')
  return body?.textContent?.trim() || blockId
}

function animateFocusChange(root: HTMLElement): Animation {
  const content = root.querySelector<HTMLElement>('[data-editor-content]')
  if (!content)
    throw new Error('Outline focus animation requires mounted editor content')

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return content.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    {
      duration: reducedMotion ? 100 : 500,
      easing: 'ease-in',
    },
  )
}

export function OutlineEditor({
  options,
  rootRef,
  session,
}: {
  options?: OutlineOptions
  rootRef: RefObject<HTMLDivElement | null>
  session: EditorSession
}) {
  const markerStylesRef = useRef<HTMLStyleElement>(null)
  const focusAnimationRef = useRef<Animation>(null)
  const previousFocusBlockIdRef = useRef<string | null>(null)
  const focusAnimationMountedRef = useRef(false)
  const runtime = session.outlineRuntime
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const controlledFocus = Boolean(options && Object.prototype.hasOwnProperty.call(options, 'focus'))
  const onFocusChange = options?.onFocusChange
  const focusCollapsed = snapshot.focusBlockId !== null
    && snapshot.collapsedBlockIds.includes(snapshot.focusBlockId)

  const requestFocus = useCallback((blockId: string | null) => {
    if (!controlledFocus)
      runtime.setFocus(blockId)
    onFocusChange?.(blockId ? { blockId } : null)
  }, [controlledFocus, onFocusChange, runtime])
  const toggleFocusCollapsed = () => {
    const focusBlockId = snapshot.focusBlockId
    if (!focusBlockId)
      throw new Error('Cannot collapse Outline Focus without a focus root')
    runtime.toggleCollapsed([focusBlockId])
  }

  useEffect(() => {
    const root = rootRef.current
    const markerStyles = markerStylesRef.current
    if (!root || !markerStyles)
      throw new Error('Outline marker alignment requires a mounted editor root')
    return observeOutlineMarkerAlignment(root, markerStyles)
  }, [rootRef])

  useLayoutEffect(() => {
    const previousFocusBlockId = previousFocusBlockIdRef.current
    previousFocusBlockIdRef.current = snapshot.focusBlockId

    if (!focusAnimationMountedRef.current) {
      focusAnimationMountedRef.current = true
      return
    }
    if (previousFocusBlockId === snapshot.focusBlockId)
      return

    const root = rootRef.current
    if (!root)
      throw new Error('Outline focus animation requires a mounted editor')

    focusAnimationRef.current?.cancel()
    const animation = animateFocusChange(root)
    focusAnimationRef.current = animation

    return () => {
      animation.cancel()
      if (focusAnimationRef.current === animation)
        focusAnimationRef.current = null
    }
  }, [rootRef, snapshot.focusBlockId])

  useEffect(() => {
    const root = rootRef.current
    if (!root)
      throw new Error('Outline interactions require a mounted editor root')

    const handleMarkerClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element))
        return
      const marker = target.closest('.list-marker')
      if (!marker || !root.contains(marker))
        return
      const block = marker.parentElement
      if (!block)
        throw new Error('An outline marker is not attached to a stable block')
      const blockId = block.getAttribute('data-block-id')
      if (!blockId)
        throw new Error('An outline marker is attached to a block without a stable id')
      const listKind = block.getAttribute('data-list-kind')
      if (listKind === 'task' || listKind === 'toggle')
        return

      event.preventDefault()
      event.stopPropagation()
      if (event.altKey) {
        runtime.toggleCollapsed([blockId])
        return
      }
      if (event.metaKey || event.ctrlKey) {
        runtime.selectBlock(blockId, 'toggle', visibleBlockIds(root))
        return
      }
      if (event.shiftKey) {
        runtime.selectBlock(blockId, 'range', visibleBlockIds(root))
        return
      }
      requestFocus(blockId)
    }

    root.addEventListener('click', handleMarkerClick, true)
    return () => root.removeEventListener('click', handleMarkerClick, true)
  }, [requestFocus, rootRef, runtime])

  return (
    <>
      <style ref={markerStylesRef} data-outline-marker-alignment="" />
      {snapshot.focusBlockId
        ? (
            <div {...stylex.props(outlineEditorStyles.focusNavigation)}>
              <button
                {...stylex.props(outlineEditorStyles.backButton)}
                aria-label="Show all blocks"
                title="Show all blocks"
                type="button"
                onClick={() => requestFocus(null)}
              >
                <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.9} />
              </button>
              <div {...stylex.props(outlineEditorStyles.breadcrumbs)} aria-label="Outline location">
                <span>All blocks</span>
                <span aria-hidden="true">/</span>
                <span {...stylex.props(outlineEditorStyles.focusLabel)}>{focusLabel(rootRef.current, snapshot.focusBlockId) ?? snapshot.focusBlockId}</span>
              </div>
              <button
                {...stylex.props(outlineEditorStyles.collapseButton)}
                aria-label={focusCollapsed ? 'Expand focused block' : 'Collapse focused block'}
                type="button"
                onClick={toggleFocusCollapsed}
              >
                {focusCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
          )
        : null}
    </>
  )
}
