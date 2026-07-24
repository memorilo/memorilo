import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

import { appStyles } from '../styles/app.stylex'

const memories = Array.from({ length: 1_000 }, (_, index) => ({
  id: index + 1,
  title: `Memory ${index + 1}`,
  updated: `${(index % 28) + 1} July 2026`,
}))

function LibraryRoute() {
  const scrollElement = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: memories.length,
    estimateSize: () => 68,
    getScrollElement: () => scrollElement.current,
    overscan: 8,
  })

  return (
    <section {...stylex.props(appStyles.page, appStyles.libraryPage)}>
      <header {...stylex.props(appStyles.pageHeader, appStyles.pageHeaderCompact)}>
        <p {...stylex.props(appStyles.eyebrow)}>1,000 entries</p>
        <h1 {...stylex.props(appStyles.pageTitle)}>Library</h1>
      </header>
      <div ref={scrollElement} {...stylex.props(appStyles.memoryScroll)}>
        <div {...stylex.props(appStyles.memoryList)} style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const memory = memories[virtualItem.index]
            if (!memory)
              throw new Error(`Missing memory at index ${virtualItem.index}`)

            return (
              <article
                key={memory.id}
                {...stylex.props(appStyles.memoryRow)}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <strong>{memory.title}</strong>
                <span {...stylex.props(appStyles.memoryDate)}>{memory.updated}</span>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export const Route = createFileRoute('/library')({ component: LibraryRoute })
