import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { useEffect, useSyncExternalStore } from 'react'
import { resolveConfigLanguage, setI18nLanguage } from '../../i18n'
import { DesktopConfigurationContext } from '../../shared/configuration'

export function DesktopConfigurationEnvironment({
  children,
  store,
}: {
  children: ReactNode
  store: ConfigurationStore<DesktopConfiguration>
}) {
  const configuration = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  useEffect(() => {
    document.documentElement.lang = configuration.language === 'system'
      ? navigator.language
      : configuration.language
    setI18nLanguage(resolveConfigLanguage(configuration.language))
  }, [configuration.language])

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(configuration.reduceMotion)
  }, [configuration.reduceMotion])

  return (
    <DesktopConfigurationContext value={configuration}>
      <MotionConfig reducedMotion={configuration.reduceMotion ? 'always' : 'user'}>
        {children}
      </MotionConfig>
    </DesktopConfigurationContext>
  )
}
