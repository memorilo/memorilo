import { lazy } from 'react'

export const MemoriloEditor = lazy(() => import('./editor').then(mod => ({ default: mod.MemoriloEditor })))
export type { LoroDocType } from './editor'
