import { createRootRoute, Outlet } from '@tanstack/react-router'

import { AppChrome } from '../components/app-titlebar'

function RootLayout() {
  return (
    <AppChrome>
      <Outlet />
    </AppChrome>
  )
}

export const Route = createRootRoute({ component: RootLayout })
