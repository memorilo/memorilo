import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { DesktopConfigurationEnvironment } from './configuration'
import { createRendererConfigurationStore } from './configuration-store'
import { router } from './router'
import './styles/app-global.stylex'

const rootElement = document.querySelector('#root')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

if (!rootElement)
  throw new Error('Missing renderer root element')

const root = createRoot(rootElement)
void createRendererConfigurationStore().then((store) => {
  window.addEventListener('beforeunload', () => store.close(), { once: true })
  root.render(
    <StrictMode>
      <DesktopConfigurationEnvironment store={store}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </DesktopConfigurationEnvironment>
    </StrictMode>,
  )
})
