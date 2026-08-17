import type { MobileRuntime } from './mobile-runtime'
import { createContext, use } from 'react'

export type MobileRuntimeState
  = | { status: 'error', error: Error }
    | { status: 'loading' }
    | { status: 'ready', runtime: MobileRuntime }

export const MobileRuntimeContext = createContext<MobileRuntimeState | null>(null)

export function useMobileRuntimeState(): MobileRuntimeState {
  const state = use(MobileRuntimeContext)
  if (!state)
    throw new Error('useMobileRuntimeState must be used inside MobileRuntimeProvider')
  return state
}
