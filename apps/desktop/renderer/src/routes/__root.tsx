import { createRootRoute, Outlet } from '@tanstack/react-router'

import { AppShell } from '../components/app-shell'

function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

export const Route = createRootRoute({ component: RootLayout })
