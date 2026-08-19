import type { MobileAppearancePreference } from './mobile-appearance'
import { createContext } from 'react'

export interface MobileAppearanceContextValue {
  error: Error | null
  pending: boolean
  preference: MobileAppearancePreference
  ready: boolean
  setPreference: (preference: MobileAppearancePreference) => Promise<void>
}

export const MobileAppearanceContext = createContext<MobileAppearanceContextValue | null>(null)
