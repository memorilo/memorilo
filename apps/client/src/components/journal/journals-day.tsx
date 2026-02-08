import { effectCommands } from '@memorilo/api/command'
import { Skeleton } from '@memorilo/components/ui/skeleton'
import { Effect } from 'effect'
import { useEffect, useRef } from 'react'
import { JournalEditor } from '~/components/journal-editor'
import { getJournalCreateInput } from '~/hooks/use-journals'

interface JournalsDayProps {
  dateKey: string
  docId: string | null
  autoCreate: boolean
  onCreated: (dateKey: string, docId: string) => void
}

// Render a single day card.
// When auto-create is enabled and the journal doesn't exist yet, creation starts only after the
// card intersects the viewport (avoids "virtualizer mounted it briefly" -> endless creates).
export function JournalsDay({
  dateKey,
  docId,
  autoCreate,
  onCreated,
}: JournalsDayProps) {
  const creatingRef = useRef(false)
  const rowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!autoCreate || docId) {
      return
    }

    const el = rowRef.current
    if (!el) {
      return
    }

    // NOTE: Virtualizer can briefly mount rows that are not actually visible (e.g. estimate mismatch).
    // Only start auto-creation once the row intersects the viewport.
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (!entry?.isIntersecting) {
        return
      }
      if (creatingRef.current) {
        return
      }

      creatingRef.current = true
      const { createdAt, title } = getJournalCreateInput(dateKey)

      void Effect.runPromise(
        effectCommands.createJournal(createdAt, title).pipe(
          // Notify parent so the editor can render without waiting for a refetch.
          Effect.tap(newDocId => Effect.sync(() => onCreated(dateKey, newDocId))),
          // Avoid unhandled promise rejections; creation will be retried on remount/scroll.
          Effect.catchAll(() => Effect.succeed(null)),
          Effect.ignore,
          // Always clear the creating flag (success/failure).
          Effect.ensuring(Effect.sync(() => {
            creatingRef.current = false
          })),
        ),
      )
    })

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [autoCreate, docId, dateKey, onCreated])

  return (
    <div
      ref={rowRef}
      className="flex flex-col bg-background"
    >
      <div className="px-4 py-3">
        <div>
          {docId
            ? <JournalEditor docId={docId} />
            : (
                <div className="flex min-h-[180px] flex-col gap-3">
                  <Skeleton className="h-10 w-48" />
                  <div className="min-h-0 flex-1 space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </div>
              )}
        </div>
      </div>
    </div>
  )
}
