import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { createContext, use } from 'react'

export const DesktopConfigurationContext = createContext<DesktopConfiguration | null>(null)

export function useDesktopConfiguration(): DesktopConfiguration {
  const configuration = use(DesktopConfigurationContext)
  if (!configuration)
    throw new Error('Desktop configuration is unavailable outside its environment')
  return configuration
}
