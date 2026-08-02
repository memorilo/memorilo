import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { initI18n, setI18nLanguage } from '../i18n/init'
import '@testing-library/jest-dom/vitest'

initI18n('en')

const reactTestEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true
configure({ asyncUtilTimeout: 10_000 })

const originalConsoleError = console.error
let reactActWarnings: string[] = []

beforeEach(() => {
  reactActWarnings = []
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(' ')
    if (message.includes('not wrapped in act'))
      reactActWarnings.push(message)
    originalConsoleError(...args)
  }
})

afterEach(() => {
  cleanup()
  console.error = originalConsoleError
  delete document.documentElement.dataset.reduceMotion
  document.documentElement.lang = 'en'
  setI18nLanguage('en')
  if (reactActWarnings.length > 0)
    throw new Error(`React updates escaped act(): ${reactActWarnings.length} warning(s)`)
})
