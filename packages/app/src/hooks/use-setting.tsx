import { memorilo } from '@memorilo/core'
import { Either, Option } from 'effect'
import { useCallback, useRef, useSyncExternalStore } from 'react'

export interface SettingResult<T> {
  error: Error | null
  status: 'success' | 'error'
  data: T
}

export function useSetting<T>(key: string): SettingResult<T | null>
export function useSetting<T>(key: string, defaultValue: T): SettingResult<T>
export function useSetting<T>(key: string, defaultValue?: T): SettingResult<T | null> {
  const lastSnapshotRef = useRef<SettingResult<T | null> | null>(null)

  const subscribe = useCallback((cb: () => void) => {
    const disposable = memorilo.settings.watch(key, () => cb())
    return () => disposable.dispose()
  }, [key])

  const getSnapshot = useCallback(() => {
    const result = memorilo.settings.get<T>(key)
    let nextSnapshot: SettingResult<T | null>

    if (Either.isLeft(result)) {
      nextSnapshot = {
        error: result.left,
        status: 'error',
        data: defaultValue ?? null,
      }
    }
    else {
      const opt = result.right
      const val = Option.getOrElse(opt, () => defaultValue ?? null)
      nextSnapshot = {
        error: null,
        status: 'success',
        data: val,
      }
    }

    const lastSnapshot = lastSnapshotRef.current
    if (lastSnapshot) {
      const statusMatch = lastSnapshot.status === nextSnapshot.status
      const dataMatch = lastSnapshot.data === nextSnapshot.data
      const errorMatch = lastSnapshot.error?.message === nextSnapshot.error?.message

      if (statusMatch && dataMatch && errorMatch) {
        return lastSnapshot
      }
    }

    lastSnapshotRef.current = nextSnapshot
    return nextSnapshot
  }, [key, defaultValue])

  return useSyncExternalStore(subscribe, getSnapshot)
}
