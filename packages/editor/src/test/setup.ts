import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach } from 'vitest'
import { initEditorI18nForTests } from '../i18n/init'

import '@testing-library/jest-dom/vitest'

beforeAll(async () => {
  await initEditorI18nForTests()
})

const reactTestEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
reactTestEnvironment.IS_REACT_ACT_ENVIRONMENT = true

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
  if (reactActWarnings.length > 0)
    throw new Error(`React updates escaped act(): ${reactActWarnings.length} warning(s)`)
})
