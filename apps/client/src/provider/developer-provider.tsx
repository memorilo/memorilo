import { ReactQueryDevtools } from '@tanstack/react-query-devtools/production'
import { TanStackRouterDevtoolsInProd } from '@tanstack/react-router-devtools'
import { useEffect } from 'react'
import { setOptions } from 'react-scan'
import { scan } from 'react-scan/all-environments'
import { useSetting } from '~/hooks/use-setting'

function ReactScan({ enable }: { enable?: boolean }) {
  useEffect(() => {
    scan({
      enabled: enable,
    })
    setOptions({
      enabled: enable,
      showToolbar: enable,
      showFPS: enable,
    })
    return () => {
      setOptions({
        enabled: false,
        showToolbar: false,
      })
    }
  }, [enable])
  return null
}

export function DeveloperProvider() {
  const { data: enableScan } = useSetting('dev::scan', false)
  const { data: enableRouter } = useSetting('dev::router', false)
  const { data: enableQuery } = useSetting('dev::query', false)

  return (
    <>
      <ReactScan enable={enableScan} />
      {enableRouter && <TanStackRouterDevtoolsInProd position="bottom-left" />}
      {enableQuery && <ReactQueryDevtools initialIsOpen={false} />}
    </>
  )
}
