import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import {
  DesktopConfigurationEnvironment,
} from './configuration'
import { createRendererConfigurationStore } from './configuration-store'
import { resolveConfigLanguage } from './i18n'
import { initI18n } from './i18n/init'
import { NotePersistenceProvider } from './note-persistence-context'
import { router } from './router'
import './styles/renderer-global.css'

const rootElement = document.querySelector('#root')

if (!rootElement)
  throw new Error('Missing renderer root element')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

const root = createRoot(rootElement)

void createRendererConfigurationStore().then((store) => {
  const configuration = store.getSnapshot()
  const language = resolveConfigLanguage(configuration.language)
  return initI18n(language).then(() => {
    window.addEventListener('beforeunload', () => store.close(), { once: true })
    root.render(
      <StrictMode>
        <DesktopConfigurationEnvironment store={store}>
          <QueryClientProvider client={queryClient}>
            <NotePersistenceProvider>
              <RouterProvider router={router} />
            </NotePersistenceProvider>
          </QueryClientProvider>
        </DesktopConfigurationEnvironment>
      </StrictMode>,
    )
  })
}, (error) => {
  root.render(
    <main role="alert">
      {error instanceof Error ? error.message : String(error)}
    </main>,
  )
})
