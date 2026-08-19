import type { MobileLanguageContextValue } from './mobile-language-context'
import { use } from 'react'
import { MobileLanguageContext } from './mobile-language-context'

export function useMobileLanguage(): MobileLanguageContextValue {
  const context = use(MobileLanguageContext)
  if (!context)
    throw new Error('useMobileLanguage must be used inside MobileLanguageProvider')
  return context
}
