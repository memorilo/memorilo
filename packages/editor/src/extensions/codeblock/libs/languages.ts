import { Console, Effect } from 'effect'
import Prism from 'prismjs'
import components from 'prismjs/components.json'
import 'prismjs/plugins/autoloader/prism-autoloader'

// By setting this value to true, Prism will not automatically highlight all code elements on the page.
Prism.manual = true

const autoloader = Prism.plugins.autoloader
autoloader.use_minified = false
autoloader.languages_path = '/prism/'

export const languages = Object.entries(components.languages)
  .filter(([, value]) => 'title' in value)
  .map(([key, value]) => {
    return {
      key,
      label: (value as any).title as string,
    }
  })
export const languageMap = Object.fromEntries(languages.map(lang => [lang.key, lang.label]))

export function loadPrismLanguage(lang: string): Promise<void> {
  if (isPrismLanguageLoaded(lang)) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    autoloader.loadLanguages(lang, () => {
      Effect.runPromise(Console.info(`Prism language loaded: ${lang}`))
      if (Prism.languages[lang] !== undefined) {
        resolve()
      }
      else {
        reject(new Error(`Failed to load Prism language: ${lang}`))
      }
    })
  })
}

export function isPrismLanguageLoaded(lang: string) {
  return Prism.languages[lang] !== undefined
}
