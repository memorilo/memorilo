import type { JournalsState } from '~/hooks/use-journals'
import { JournalsDay } from './journals-day'

function isScrolledToBottom(el: HTMLElement) {
  // `ceil` helps avoid being off by a fractional pixel.
  return Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight
}

export function JournalsList({ state }: { state: JournalsState }) {
  const {
    autoCreateEnabled,
    docIdByDateKey,
    handleCreated,
    getRow,
    listError,
    onAutoScrollEnd,
    parentRef,
    rowVirtualizer,
    todayKey,
    virtualItems,
  } = state

  if (listError) {
    const errorMessage = typeof listError === 'string'
      ? listError
      : listError instanceof Error
        ? listError.message
        : 'Unknown error'
    return (
      <div className="px-4 py-6 text-sm text-destructive">
        {errorMessage}
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="size-full overflow-y-auto"
      onScroll={(e) => {
        if (!onAutoScrollEnd) {
          return
        }
        if (isScrolledToBottom(e.currentTarget)) {
          onAutoScrollEnd()
        }
      }}
    >
      <div className="mx-auto w-full max-w-4xl">
        <div
          className="relative w-full"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {virtualItems.map(({ index, start }) => {
            const item = getRow(index)
            if (!item) {
              return null
            }
            const resolvedDocId = docIdByDateKey[item.dateKey] ?? null
            return (
              <div
                key={item.dateKey}
                data-index={index}
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full border-t border-border/30 first:border-t-0"
                style={{ transform: `translateY(${start}px)` }}
              >
                <JournalsDay
                  dateKey={item.dateKey}
                  docId={resolvedDocId}
                  autoCreate={autoCreateEnabled || item.dateKey === todayKey}
                  onCreated={handleCreated}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
