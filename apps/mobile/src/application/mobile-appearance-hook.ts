import { use } from 'react'
import { MobileAppearanceContext } from './mobile-appearance-context'

export function useMobileAppearance() {
  const value = use(MobileAppearanceContext)
  if (!value)
    throw new Error('useMobileAppearance must be used inside MobileAppearanceProvider')
  return value
}
