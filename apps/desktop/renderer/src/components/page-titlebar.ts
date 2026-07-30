import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, use, useLayoutEffect } from 'react'

export interface PageTitlebarOptions {
  onRenameTitle?: (title: string) => Promise<{ error?: string } | void>
  title?: string
  trailing?: ReactNode
}

export const PageTitlebarContext = createContext<Dispatch<SetStateAction<PageTitlebarOptions | null>> | null>(null)

export function usePageTitlebar(options: PageTitlebarOptions) {
  const setPageTitlebar = use(PageTitlebarContext)
  if (!setPageTitlebar)
    throw new Error('usePageTitlebar must be used within AppShell')

  useLayoutEffect(() => {
    setPageTitlebar(options)
    return () => setPageTitlebar(current => current === options ? null : current)
  }, [options, setPageTitlebar])
}
