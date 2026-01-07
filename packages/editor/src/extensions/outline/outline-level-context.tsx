import { createContext, use } from 'react'

export interface OutlineLevelContextValue {
  level: number
}

const defaultValue: OutlineLevelContextValue = {
  level: 1,
}

export const OutlineLevelContext = createContext<OutlineLevelContextValue>(defaultValue)

export function useOutlineLevel() {
  return use(OutlineLevelContext)
}
