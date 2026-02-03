import { window } from '@tauri-apps/api'
import { useEffect, useRef } from 'react'

export function useTitle(title: string) {
  const win = window.getCurrentWindow()
  const titleReplaced = useRef<string | null>(null)

  useEffect(() => {
    const recover = win.title().then((pretitle) => {
      if (titleReplaced.current === title)
        return () => {}
      titleReplaced.current = title
      win.setTitle(title)
      return () => win.setTitle(pretitle)
    })

    return () => {
      recover.then(f => f())
    }
  }, [win, title])
}
