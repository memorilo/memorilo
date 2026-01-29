import { window } from '@tauri-apps/api'
import { useEffect } from 'react'

export function useTitle(title: string) {
  const win = window.getCurrentWindow()

  useEffect(() => {
    const preTitle = win.title()

    win.setTitle(title)
    return () => {
      preTitle.then(t => win.setTitle(t))
    }
  }, [win, title])
}
