import type { PropsWithChildren } from 'react'
import type { MobileAppearanceContextValue } from './mobile-appearance-context'
import { Directory, File, Paths } from 'expo-file-system'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MobileAppearanceContext } from './mobile-appearance-context'

export type MobileAppearancePreference = 'automatic' | 'solid'

const settingsDirectoryName = 'memorilo-settings'
const appearanceFileName = 'appearance.json'

class MobileAppearanceStore {
  readonly #directory: Directory
  readonly #file: File
  #mutation: Promise<void> = Promise.resolve()

  private constructor(directory: Directory) {
    this.#directory = directory
    this.#file = new File(directory, appearanceFileName)
  }

  static async open(): Promise<{ preference: MobileAppearancePreference, store: MobileAppearanceStore }> {
    const directory = new Directory(Paths.document, settingsDirectoryName)
    directory.create({ idempotent: true, intermediates: true })
    const store = new MobileAppearanceStore(directory)
    if (!store.#file.exists)
      return { preference: 'automatic', store }
    const parsed: unknown = JSON.parse(await store.#file.text())
    if (parsed !== null && typeof parsed === 'object' && 'preference' in parsed) {
      const preference = parsed.preference
      if (preference === 'automatic' || preference === 'solid')
        return { preference, store }
    }
    throw new Error('Mobile appearance preference file is invalid')
  }

  async save(preference: MobileAppearancePreference): Promise<void> {
    const result = this.#mutation.then(async () => {
      const temporary = new File(this.#directory, `.appearance.${crypto.randomUUID()}.tmp`)
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

export function MobileAppearanceProvider({ children }: PropsWithChildren) {
  const storeRef = useRef<MobileAppearanceStore | null>(null)
  const [preference, setPreferenceState] = useState<MobileAppearancePreference>('automatic')
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let active = true
    void MobileAppearanceStore.open().then(
      ({ preference: storedPreference, store }) => {
        if (!active)
          return
        storeRef.current = store
        setPreferenceState(storedPreference)
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
  }, [])

  const setPreference = useCallback(async (nextPreference: MobileAppearancePreference) => {
    const previousPreference = preference
    setPreferenceState(nextPreference)
    setError(null)
    setPending(true)
    try {
      const store = storeRef.current
      if (!store)
        throw new Error('Mobile appearance preferences are still loading')
      await store.save(nextPreference)
    }
    catch (failure) {
      setPreferenceState(previousPreference)
      const nextError = failure instanceof Error ? failure : new Error(String(failure))
      setError(nextError)
      throw nextError
    }
    finally {
      setPending(false)
    }
  }, [preference])

  const value = useMemo<MobileAppearanceContextValue>(() => ({
    error,
    pending,
    preference,
    ready,
    setPreference,
  }), [error, pending, preference, ready, setPreference])

  return <MobileAppearanceContext value={value}>{children}</MobileAppearanceContext>
}
