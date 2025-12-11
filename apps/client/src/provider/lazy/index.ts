import { lazy } from 'react'

export const LazyDeveloperProvider = lazy(() => import('../developer-provider').then(module => ({ default: module.DeveloperProvider })))
