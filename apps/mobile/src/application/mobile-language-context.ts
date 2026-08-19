import type { SupportedLanguage } from '@memorilo/config'
import type { MobileLanguagePreference } from './mobile-language'
import { createContext } from 'react'

export interface MobileLanguageContextValue {
  error: Error | null
  language: SupportedLanguage
  preference: MobileLanguagePreference
  ready: boolean
  setPreference: (preference: MobileLanguagePreference) => Promise<void>
}

export const MobileLanguageContext = createContext<MobileLanguageContextValue | null>(null)
