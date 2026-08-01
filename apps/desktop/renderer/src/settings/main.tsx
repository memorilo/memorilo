import * as stylex from '@stylexjs/stylex'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import {
  DesktopConfigurationEnvironment,
} from '../configuration'
import { createRendererConfigurationStore } from '../configuration-store'
import { resolveConfigLanguage } from '../i18n'
import { initI18n } from '../i18n/init'
import { Settings } from './settings'
import { settingsStyles } from './settings.stylex'
import '../styles/renderer-global.css'

const rootElement = document.querySelector('#root')

if (!rootElement)
  throw new Error('Missing settings renderer root element')

const root = createRoot(rootElement)

void createRendererConfigurationStore().then((store) => {
  const configuration = store.getSnapshot()
  const language = resolveConfigLanguage(configuration.language)
  return initI18n(language).then(() => {
    window.addEventListener('beforeunload', () => store.close(), { once: true })
    root.render(
      <StrictMode>
        <DesktopConfigurationEnvironment store={store}>
          <Settings store={store} />
        </DesktopConfigurationEnvironment>
      </StrictMode>,
    )
  })
}, (error) => {
  root.render(
    <main {...stylex.props(settingsStyles.status)} role="alert">
      {error instanceof Error ? error.message : String(error)}
    </main>,
  )
})
