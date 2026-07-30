import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, use, useLayoutEffect } from 'react'

export interface PageTitlebarOptions {
  navigationOffset?: number
  onRenameTitle?: (title: string) => void
  title?: string
  trailingActions?: ReactNode
}

export const PageTitlebarContext = createContext<Dispatch<SetStateAction<PageTitlebarOptions | null>> | null>(null)

export function usePageTitlebar(options: PageTitlebarOptions) {
  const setPageTitlebar = use(PageTitlebarContext)
  if (!setPageTitlebar)
    throw new Error('usePageTitlebar must be used within AppChrome')

  useLayoutEffect(() => {
    setPageTitlebar(options)
    return () => setPageTitlebar(current => current === options ? null : current)
  }, [options, setPageTitlebar])
}
