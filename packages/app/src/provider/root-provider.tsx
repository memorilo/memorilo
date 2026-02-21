import type { PropsWithChildren } from 'react'
import { jotaiStore } from '@memorilo/utils/jotai'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import { EffectsHost } from './effects-host'
import { I18nProvider } from './i18n-provider'
import { LazyDeveloperProvider } from './lazy'
import { SettingSync } from './settings-sync'

export function RootProvider({ children }: PropsWithChildren) {
  return (
    <Provider store={jotaiStore}>
      <I18nProvider>
        <EffectsHost />
        <SettingSync />
        {children}
        <Suspense>
          <LazyDeveloperProvider />
        </Suspense>
      </I18nProvider>
    </Provider>
  )
}
