import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef } from 'react'

let nextId = 0
let activeId = 0

export function useTitle(title: string) {
  const idRef = useRef(0)
  const mountRunRef = useRef(0)
  const previousTitleRef = useRef<Promise<string> | null>(null)

  if (idRef.current === 0) {
    idRef.current = ++nextId
  }

  useEffect(() => {
    const win = getCurrentWindow()
    const runId = ++mountRunRef.current

    if (!previousTitleRef.current) {
      previousTitleRef.current = win.title().catch(() => '')
    }

    return () => {
      if (runId !== mountRunRef.current) {
        return
      }
      if (activeId !== idRef.current) {
        return
      }
      previousTitleRef.current
        ?.then((previousTitle) => {
          // eslint-disable-next-line react-hooks/exhaustive-deps
          if (runId !== mountRunRef.current) {
            return
          }
          if (activeId !== idRef.current) {
            return
          }
          void win.setTitle(previousTitle)
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    const win = getCurrentWindow()
    activeId = idRef.current
    void win.setTitle(title)
  }, [title])
}
