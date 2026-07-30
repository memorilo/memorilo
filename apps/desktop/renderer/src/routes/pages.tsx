import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { Files } from 'lucide-react'

import { usePageTitlebar } from '../components/page-titlebar'
import { pagesRouteStyles } from './-pages.stylex'

const pagesTitlebar = { title: 'Pages' } as const

function PagesRoute() {
  usePageTitlebar(pagesTitlebar)

  return (
    <main {...stylex.props(pagesRouteStyles.page)} aria-label="Pages">
      <div {...stylex.props(pagesRouteStyles.emptyState)} role="status">
        <Files {...stylex.props(pagesRouteStyles.emptyIcon)} aria-hidden="true" strokeWidth={1.5} />
        <p {...stylex.props(pagesRouteStyles.emptyLabel)}>No pages</p>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/pages')({ component: PagesRoute })
