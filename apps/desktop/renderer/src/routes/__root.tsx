import * as stylex from '@stylexjs/stylex'
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { BookOpen, House, PenLine } from 'lucide-react'

import { appStyles } from '../styles/app.stylex'

const navigation = [
  { label: 'Home', to: '/', icon: House },
  { label: 'Editor', to: '/editor', icon: PenLine },
  { label: 'Library', to: '/library', icon: BookOpen },
] as const

function RootLayout() {
  return (
    <div {...stylex.props(appStyles.appShell)}>
      <aside {...stylex.props(appStyles.sidebar)}>
        <div {...stylex.props(appStyles.brand)}>Memorilo</div>
        <nav {...stylex.props(appStyles.navigation)} aria-label="Primary navigation">
          {navigation.map(({ icon: Icon, label, to }) => (
            <Link
              key={to}
              {...stylex.props(appStyles.navLink)}
              activeProps={stylex.props(appStyles.navLinkActive)}
              to={to}
            >
              <Icon aria-hidden="true" size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <main {...stylex.props(appStyles.workspace)}>
        <Outlet />
      </main>
    </div>
  )
}

export const Route = createRootRoute({ component: RootLayout })
