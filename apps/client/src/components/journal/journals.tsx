import type { JournalsState } from '~/hooks/use-journals'
import { JournalsDay } from './journals-day'

export function JournalsList({ state }: { state: JournalsState }) {
  const {
    activeQuery,
    autoCreateEnabled,
    createdDocMap,
    handleCreated,
    items,
    parentRef,
    rowVirtualizer,
    todayKey,
    virtualItems,
  } = state

  if (activeQuery.status === 'error') {
    return (
      <div className="px-4 py-6 text-sm text-destructive">
        {String(activeQuery.error)}
      </div>
    )
  }

  return (
    <div ref={parentRef} className="size-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-0 py-0">
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {items.length === 0 && activeQuery.status === 'pending'
            ? (
                <div className="py-6 text-sm text-muted-foreground">Loading...</div>
              )
            : (
                virtualItems.map((virtualRow) => {
                  const item = items[virtualRow.index]
                  if (!item) {
                    return null
                  }
                  return (
                    <div
                      key={item.dateKey}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full border-t border-border/30 first:border-t-0"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <JournalsDay
                        dateKey={item.dateKey}
                        docId={createdDocMap[item.dateKey] ?? item.docId}
                        autoCreate={autoCreateEnabled || item.dateKey === todayKey}
                        onCreated={handleCreated}
                      />
                    </div>
                  )
                })
              )}
        </div>
      </div>
    </div>
  )
}
