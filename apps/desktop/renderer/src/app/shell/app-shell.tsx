import type { CSSProperties, ReactNode } from 'react'
import type { PaletteCommand } from '../../shared/command-palette'
import type { PageTitlebarOptions } from '../../shared/page-titlebar'
import * as stylex from '@stylexjs/stylex'
import { useCallback, useState } from 'react'

import { CommandPaletteCommandsContext } from '../../shared/command-palette'
import { PageTitlebarContext } from '../../shared/page-titlebar'
import { CommandPalette } from '../command-palette/command-palette'
import { appShellStyles } from './app-shell.stylex'
import { AppTitlebar } from './app-titlebar'
import { AppToastContainer } from './app-toast'
import { TodoCalendarBootstrap } from './todo-calendar-bootstrap'
import { WorkspaceSidebar } from './workspace-sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  const [pageTitlebar, setPageTitlebar] = useState<PageTitlebarOptions | null>(null)
  const [pageCommands, setPageCommands] = useState<readonly PaletteCommand[]>([])
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const toggleSidebar = useCallback(() => setSidebarVisible(visible => !visible), [])
  const compactCanvasTitlebar = pageTitlebar?.titleVisibility === 'hidden'
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
              compactCollapsed={compactCanvasTitlebar}
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
          <TodoCalendarBootstrap />
          <AppToastContainer />
        </div>
      </CommandPaletteCommandsContext>
    </PageTitlebarContext>
  )
}
