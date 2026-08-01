import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { initI18n, setI18nLanguage } from '../i18n/init'
import '@testing-library/jest-dom/vitest'

initI18n('en')

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.reduceMotion
  document.documentElement.lang = 'en'
  setI18nLanguage('en')
})
