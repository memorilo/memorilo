import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { useSyncExternalStore } from 'react'

import { DesktopConfigurationContext } from './configuration-context'

export function DesktopConfigurationEnvironment({
  children,
  store,
}: {
  children: ReactNode
  store: ConfigurationStore<DesktopConfiguration>
}) {
  const configuration = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return (
    <DesktopConfigurationContext value={configuration}>
      <MotionConfig reducedMotion={configuration.reduceMotion ? 'always' : 'user'}>
        {children}
      </MotionConfig>
    </DesktopConfigurationContext>
  )
}
