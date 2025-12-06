import type { ReactNode } from 'react'
import { lazy, Suspense, useEffect } from 'react'
import { scan } from 'react-scan/all-environments'

const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools/production').then(res => ({
    default: res.ReactQueryDevtools,
  })),
)

const TanStackRouterDevtools = lazy(() =>
  import('@tanstack/react-router-devtools').then(res => ({
    default: res.TanStackRouterDevtoolsInProd,
  })),
)

function ReactScan({ children, enable }: { children: ReactNode, enable?: boolean }) {
  useEffect(() => {
    scan({
      enabled: enable,
    })
  }, [enable])
  return children
}

function QueryDevtools({ children, enable }: { children: ReactNode, enable?: boolean }) {
  return (
    <>
      {children}
      {enable && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </>
  )
}

function RouterDevtools({ children, enable }: { children: ReactNode, enable?: boolean }) {
  return (
    <>
      {children}
      {enable && (
        <Suspense fallback={null}>
          <TanStackRouterDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </>
  )
}

interface DebugInfoProps {
  scan?: boolean
  query?: boolean
  children: ReactNode
}

export function DebugInfo({ children, scan = true, query = true }: DebugInfoProps) {
  return (
    <QueryDevtools enable={query}>
      <RouterDevtools enable={query}>
        <ReactScan enable={scan}>
          {children}
        </ReactScan>
      </RouterDevtools>
    </QueryDevtools>
  )
}
