import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router'
import { useLayoutEffect } from 'react'

import { AppShell } from '../app/shell/app-shell'

function RootLayout() {
  const panel = useLocation().pathname === '/panel'

  useLayoutEffect(() => {
    document.body.dataset.renderer = panel ? 'panel' : 'main'
  }, [panel])

  if (panel)
    return <Outlet />

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export const Route = createRootRoute({ component: RootLayout })
