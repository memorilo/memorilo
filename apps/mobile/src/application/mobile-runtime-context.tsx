import type { PropsWithChildren } from 'react'
import type { MobileRuntime } from './mobile-runtime'
import type { MobileRuntimeState } from './mobile-runtime-state'
import { useEffect, useMemo, useState } from 'react'
import { openMobileRuntime } from './mobile-runtime'
import { MobileRuntimeContext } from './mobile-runtime-state'

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function MobileRuntimeProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<MobileRuntimeState>({ status: 'loading' })

  useEffect(() => {
    let disposed = false
    let openedRuntime: MobileRuntime | null = null

    void openMobileRuntime().then(
      async (runtime) => {
        if (disposed) {
          await runtime.close()
          return
        }
        openedRuntime = runtime
        setState({ runtime, status: 'ready' })
      },
      (error: unknown) => {
        if (!disposed) {
          setState({ error: toError(error), status: 'error' })
        }
      },
    )

    return () => {
      disposed = true
      if (openedRuntime)
        void openedRuntime.close()
    }
  }, [])

  const value = useMemo(() => state, [state])
  return <MobileRuntimeContext value={value}>{children}</MobileRuntimeContext>
}
