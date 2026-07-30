import type { ReactNode } from 'react'
import type { PageTitlebarOptions } from './page-titlebar'
import * as stylex from '@stylexjs/stylex'
import { useCallback, useState } from 'react'

import { appShellStyles } from './app-shell.stylex'
import { AppTitlebar } from './app-titlebar'
import { CommandPalette } from './command-palette'
import { PageTitlebarContext } from './page-titlebar'
import { WorkspaceSidebar } from './workspace-sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  const [pageTitlebar, setPageTitlebar] = useState<PageTitlebarOptions | null>(null)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const toggleSidebar = useCallback(() => setSidebarVisible(visible => !visible), [])

  return (
    <PageTitlebarContext value={setPageTitlebar}>
      <div {...stylex.props(appShellStyles.shell)}>
        <AppTitlebar page={pageTitlebar} sidebarVisible={sidebarVisible} />
        <div {...stylex.props(appShellStyles.body)}>
          <WorkspaceSidebar
            visible={sidebarVisible}
            onToggle={toggleSidebar}
          />
          <div {...stylex.props(appShellStyles.routeViewport)}>{children}</div>
        </div>
        <CommandPalette
          sidebarVisible={sidebarVisible}
          onToggleSidebar={toggleSidebar}
        />
      </div>
    </PageTitlebarContext>
  )
}
