import type { SupportedLanguage } from '@memorilo/config'
import type { Resource } from 'i18next'
import type { PropsWithChildren } from 'react'
import type { MobileLanguageContextValue } from './mobile-language-context'
import { DEFAULT_LANGUAGE, resolveSupportedLanguage } from '@memorilo/config'
import { Directory, File, Paths } from 'expo-file-system'
import { createInstance } from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import appEn from '../../../../locales/app/en.json'
import appZh from '../../../../locales/app/zh.json'
import commonEn from '../../../../locales/common/en.json'
import commonZh from '../../../../locales/common/zh.json'
import editorEn from '../../../../locales/editor/en.json'
import editorZh from '../../../../locales/editor/zh.json'
import learningEn from '../../../../locales/learning/en.json'
import learningZh from '../../../../locales/learning/zh.json'
import pagesEn from '../../../../locales/pages/en.json'
import pagesZh from '../../../../locales/pages/zh.json'
import settingsEn from '../../../../locales/settings/en.json'
import settingsZh from '../../../../locales/settings/zh.json'
import { MobileLanguageContext } from './mobile-language-context'

export type MobileLanguagePreference = 'en' | 'system' | 'zh'

const resources: Resource = {
  en: {
    app: appEn,
    common: commonEn,
    editor: editorEn,
    learning: learningEn,
    pages: pagesEn,
    settings: settingsEn,
  },
  zh: {
    app: appZh,
    common: commonZh,
    editor: editorZh,
    learning: learningZh,
    pages: pagesZh,
    settings: settingsZh,
  },
}

const settingsDirectoryName = 'memorilo-settings'
const languageFileName = 'language.json'

function systemLanguage(): SupportedLanguage {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale
  return resolveSupportedLanguage(locale || DEFAULT_LANGUAGE)
}

function resolvePreference(preference: MobileLanguagePreference): SupportedLanguage {
  return preference === 'system' ? systemLanguage() : preference
}

class MobileLanguageStore {
  readonly #directory: Directory
  readonly #file: File
  #mutation: Promise<void> = Promise.resolve()

  private constructor(directory: Directory) {
    this.#directory = directory
    this.#file = new File(directory, languageFileName)
  }

  static async open(): Promise<{ preference: MobileLanguagePreference, store: MobileLanguageStore }> {
    const directory = new Directory(Paths.document, settingsDirectoryName)
    directory.create({ idempotent: true, intermediates: true })
    const store = new MobileLanguageStore(directory)
    if (!store.#file.exists)
      return { preference: 'system', store }
    const parsed: unknown = JSON.parse(await store.#file.text())
    if (parsed !== null && typeof parsed === 'object' && 'preference' in parsed) {
      const preference = parsed.preference
      if (preference === 'system' || preference === 'en' || preference === 'zh')
        return { preference, store }
    }
    throw new Error('Mobile language preference file is invalid')
  }

  async save(preference: MobileLanguagePreference): Promise<void> {
    const result = this.#mutation.then(async () => {
      const temporary = new File(this.#directory, `.language.${crypto.randomUUID()}.tmp`)
      temporary.create()
      try {
        temporary.write(JSON.stringify({ preference, version: 1 }))
        await temporary.move(this.#file, { overwrite: true })
      }
      catch (error) {
        if (temporary.exists)
          temporary.delete()
        throw error
      }
    })
    this.#mutation = result.catch(() => undefined)
    return result
  }
}

function createNativeI18n(language: SupportedLanguage) {
  const instance = createInstance()
  void instance.use(initReactI18next).init({
    defaultNS: 'common',
    fallbackLng: 'en',
    fallbackNS: ['common'],
    initImmediate: false,
    interpolation: { escapeValue: false },
    lng: language,
    ns: ['common', 'app', 'pages', 'editor', 'learning', 'settings'],
    resources,
    returnObjects: true,
  })
  return instance
}

export function MobileLanguageProvider({ children }: PropsWithChildren) {
  const initialLanguage = systemLanguage()
  const i18n = useMemo(() => createNativeI18n(initialLanguage), [initialLanguage])
  const storeRef = useRef<MobileLanguageStore | null>(null)
  const [preference, setPreferenceState] = useState<MobileLanguagePreference>('system')
  const [language, setLanguage] = useState<SupportedLanguage>(initialLanguage)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let active = true
    void MobileLanguageStore.open().then(
      ({ preference: storedPreference, store }) => {
        if (!active)
          return
        storeRef.current = store
        const nextLanguage = resolvePreference(storedPreference)
        setPreferenceState(storedPreference)
        setLanguage(nextLanguage)
        void i18n.changeLanguage(nextLanguage)
        setReady(true)
      },
      (failure: unknown) => {
        if (!active)
          return
        setError(failure instanceof Error ? failure : new Error(String(failure)))
        setReady(true)
      },
    )
    return () => {
      active = false
    }
  }, [i18n])

  const setPreference = useCallback(async (nextPreference: MobileLanguagePreference) => {
    const previousPreference = preference
    const nextLanguage = resolvePreference(nextPreference)
    setPreferenceState(nextPreference)
    setLanguage(nextLanguage)
    setError(null)
    setPending(true)
    try {
      const store = storeRef.current
      if (!store)
        throw new Error('Mobile language preferences are still loading')
      await store.save(nextPreference)
      await i18n.changeLanguage(nextLanguage)
    }
    catch (failure) {
      setPreferenceState(previousPreference)
      const previousLanguage = resolvePreference(previousPreference)
      setLanguage(previousLanguage)
      await i18n.changeLanguage(previousLanguage)
      const nextError = failure instanceof Error ? failure : new Error(String(failure))
      setError(nextError)
      throw nextError
    }
    finally {
      setPending(false)
    }
  }, [i18n, preference])

  const value = useMemo<MobileLanguageContextValue>(() => ({
    error,
    language,
    preference,
    ready: ready && !pending,
    setPreference,
  }), [error, language, pending, preference, ready, setPreference])

  return (
    <MobileLanguageContext value={value}>
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </MobileLanguageContext>
  )
}
