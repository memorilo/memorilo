import * as log from '@tauri-apps/plugin-log'
import { Option, pipe } from 'effect'
import Prism from 'prismjs'
import prismLanguages from 'prismjs/components.json'
import { isPlainLanguage } from './language'
import { normalizeTokens } from './normalize-tokens'
import 'prismjs/plugins/autoloader/prism-autoloader'

// By setting this value to true, Prism will not automatically highlight all code elements on the page.
Prism.manual = true

const autoloader = Prism.plugins.autoloader
autoloader.use_minified = false
autoloader.languages_path = '/prism/'

export function loadLanguage(lang: string) {
  if (isLanguageLoaded(lang)) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    autoloader.loadLanguages(lang, () => {
      log.info(`Prism language loaded: ${lang}`)
      if (Prism.languages[lang] !== undefined) {
        resolve()
      }
      else {
        reject(new Error(`Failed to load Prism language: ${lang}`))
      }
    })
  })
}

export function isLanguageLoaded(lang: string) {
  return Prism.languages[lang] !== undefined
}

interface PrismLanguage {
  title: string
  alias?: string | string[]
}
function isPrismLanguage(v: unknown): v is PrismLanguage {
  if (typeof v !== 'object' || v === null) {
    return false
  }
  return typeof Reflect.get(v, 'title') === 'string'
}
const languageEntries = Object.entries(prismLanguages.languages).reduce<Array<{ id: string, lang: PrismLanguage }>>(
  (acc, [id, lang]) => {
    if (isPrismLanguage(lang)) {
      acc.push({ id, lang })
    }
    return acc
  },
  [],
)
// Prism's metadata is the single source of truth for selectable languages.
export const supportedLanguages = languageEntries
  .map(({ id, lang }) => ({ id, label: lang.title }))
  .sort((a, b) => a.label.localeCompare(b.label))
const supportedLanguageIds = new Set(supportedLanguages.map(language => language.id.toLowerCase()))
const languageAliasMap = new Map<string, string>()

for (const entry of languageEntries) {
  const aliasList = pipe(
    Option.fromNullable(entry.lang.alias),
    Option.map(alias => (Array.isArray(alias) ? alias : [alias])),
    Option.getOrElse((): string[] => []),
  )
  for (const alias of aliasList) {
    languageAliasMap.set(alias.toLowerCase(), entry.id)
  }
}

export function resolveLanguageId(value: string) {
  const normalized = value.toLowerCase()
  if (supportedLanguageIds.has(normalized)) {
    return normalized
  }
  return languageAliasMap.get(normalized) ?? null
}

export type NormalizedPrismToken = ReturnType<typeof normalizeTokens>[number][number]

// Return the parsed tokens for the given text and language
// If the language is not loaded, it will log an error and return the text as plain
export function parseText(
  text: string,
  language: string,
  options?: { silent?: boolean },
): NormalizedPrismToken[][] {
  const loaded = isLanguageLoaded(language)
  if (!loaded && !options?.silent) {
    log.error(`Prism language ${language} not loaded`)
  }
  if (isPlainLanguage(language) || !loaded) {
    return [[{ types: ['plain'], content: text }]]
  }

  const tokens = Prism.tokenize(text, Prism.languages[language]!)
  return normalizeTokens(tokens)
}
