import type { CSSProperties, ReactNode } from 'react'
import type { PaletteCommand } from './command-palette-context'
import type { PageTitlebarOptions } from './page-titlebar'
import * as stylex from '@stylexjs/stylex'
import { useCallback, useState } from 'react'

import { appShellStyles } from './app-shell.stylex'
import { AppTitlebar } from './app-titlebar'
import { AppToastContainer } from './app-toast'
import { CommandPalette } from './command-palette'
import { CommandPaletteCommandsContext } from './command-palette-context'
import { PageTitlebarContext } from './page-titlebar'
import { WorkspaceSidebar } from './workspace-sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  const [pageTitlebar, setPageTitlebar] = useState<PageTitlebarOptions | null>(null)
  const [pageCommands, setPageCommands] = useState<readonly PaletteCommand[]>([])
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const toggleSidebar = useCallback(() => setSidebarVisible(visible => !visible), [])
  const shellStyle = {
    '--reader-leading-offset': sidebarVisible ? '270px' : '120px',
  } as CSSProperties

  return (
    <PageTitlebarContext value={setPageTitlebar}>
      <CommandPaletteCommandsContext value={setPageCommands}>
        <div {...stylex.props(appShellStyles.shell)} style={shellStyle}>
          <AppTitlebar page={pageTitlebar} sidebarVisible={sidebarVisible} />
          <div {...stylex.props(appShellStyles.body)}>
            <WorkspaceSidebar
              visible={sidebarVisible}
              onToggle={toggleSidebar}
            />
            <div {...stylex.props(appShellStyles.routeViewport)}>{children}</div>
          </div>
          <CommandPalette
            contextualCommands={pageCommands}
            sidebarVisible={sidebarVisible}
            onToggleSidebar={toggleSidebar}
          />
          <AppToastContainer />
        </div>
      </CommandPaletteCommandsContext>
    </PageTitlebarContext>
  )
}
