import type {
  EditorImageOcclusionTopicDocument,
  ImageOcclusionState,
} from '@memorilo/editor'
import type { RefObject } from 'react'
import { imageOcclusionStateSignature } from '@memorilo/editor'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const snapshot = useRef({ height: 1, width: 1 })
  const getSnapshot = useCallback(() => {
    const element = ref.current
    if (!element)
      return snapshot.current
    const bounds = element.getBoundingClientRect()
    const next = { height: Math.max(1, bounds.height), width: Math.max(1, bounds.width) }
    if (next.height !== snapshot.current.height || next.width !== snapshot.current.width)
      snapshot.current = next
    return snapshot.current
  }, [ref])
  const subscribe = useCallback((listener: () => void) => {
    const element = ref.current
    if (!element)
      return () => undefined
    const observer = new ResizeObserver(listener)
    observer.observe(element)
    listener()
    return () => observer.disconnect()
  }, [ref])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useImageOcclusionState(topic: EditorImageOcclusionTopicDocument): ImageOcclusionState {
  const cached = useRef<{ signature: string, state: ImageOcclusionState } | null>(null)
  const getSnapshot = useCallback(() => {
    const state = topic.getState()
    const signature = imageOcclusionStateSignature(state)
    if (cached.current?.signature === signature)
      return cached.current.state
    cached.current = { signature, state }
    return state
  }, [topic])
  return useSyncExternalStore(topic.subscribe, getSnapshot, getSnapshot)
}

export function useImage(source: string) {
  const [loaded, setLoaded] = useState<{
    error: boolean
    image: HTMLImageElement | null
    source: string
  } | null>(null)
  useEffect(() => {
    const next = new window.Image()
    let active = true
    next.onload = () => {
      if (active)
        setLoaded({ error: false, image: next, source })
    }
    next.onerror = () => {
      if (active)
        setLoaded({ error: true, image: null, source })
    }
    next.src = source
    return () => {
      active = false
      next.onload = null
      next.onerror = null
    }
  }, [source])
  const current = loaded?.source === source ? loaded : null
  return current === null
    ? { error: false, image: null }
    : { error: current.error, image: current.image }
}

export function useOcclusionHistory(
  topic: EditorImageOcclusionTopicDocument,
  state: ImageOcclusionState,
) {
  const past = useRef<ImageOcclusionState[]>([])
  const future = useRef<ImageOcclusionState[]>([])
  const expectedSignature = useRef<string | null>(null)
  const previousSignature = useRef(imageOcclusionStateSignature(state))
  const signature = imageOcclusionStateSignature(state)
  if (signature !== previousSignature.current) {
    if (signature === expectedSignature.current) {
      expectedSignature.current = null
    }
    else {
      past.current = []
      future.current = []
      expectedSignature.current = null
    }
    previousSignature.current = signature
  }

  const write = useCallback((next: ImageOcclusionState) => {
    if (imageOcclusionStateSignature(next) === imageOcclusionStateSignature(state))
      return
    past.current.push(structuredClone(state))
    future.current = []
    expectedSignature.current = imageOcclusionStateSignature(next)
    topic.setState(next)
  }, [state, topic])

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous)
      return
    future.current.push(structuredClone(state))
    expectedSignature.current = imageOcclusionStateSignature(previous)
    topic.setState(previous)
  }, [state, topic])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next)
      return
    past.current.push(structuredClone(state))
    expectedSignature.current = imageOcclusionStateSignature(next)
    topic.setState(next)
  }, [state, topic])

  return {
    canRedo: future.current.length > 0,
    canUndo: past.current.length > 0,
    redo,
    undo,
    write,
  }
}
