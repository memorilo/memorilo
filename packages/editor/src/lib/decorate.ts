import type { DecoratedRange, NodeEntry } from 'slate'
import type { CodeBlockElementType } from '../slate'
import log from '@memorilo/api/log'
import Prism from 'prismjs'
import prismLanguages from 'prismjs/components.json'
import { Node } from 'slate'
import { normalizeTokens } from './normalize-tokens'
import 'prismjs/plugins/autoloader/prism-autoloader'

Prism.manual = true

const autoloader = Prism.plugins.autoloader
autoloader.use_minified = false
autoloader.languages_path = '/prism/'

interface PrismLanguage {
  title: string
  alias?: string[]
}
function filterLanguage(v: any): v is PrismLanguage {
  return typeof v === 'object' && !!v.title
}
export const supportedLanguages = Object.entries(prismLanguages.languages).filter(([,lang]) => filterLanguage(lang)).map(([id, lang]) => ({
  id,
  label: (lang as PrismLanguage).title,
})).sort((a, b) => a.label.localeCompare(b.label))

export function decorateCodeBlock(
  [block, blockPath]: NodeEntry<CodeBlockElementType>,
  onLanguageLoaded: () => void,
) {
  const text = block.children.map(line => Node.string(line)).join('\n')
  const language = block.language ?? block.guessLanguage ?? 'text'

  if (Prism.languages[language] === undefined) {
    log.info(`Loading Prism language: ${language}`)
    autoloader.loadLanguages(language, onLanguageLoaded)
    return []
  }

  if (language === 'text') {
    return []
  }

  const tokens = Prism.tokenize(text, Prism.languages[language])
  const normalizedTokens = normalizeTokens(tokens)
  const decorations: DecoratedRange[] = []

  for (let index = 0; index < normalizedTokens.length; index++) {
    const tokens = normalizedTokens[index]

    let start = 0
    for (const token of tokens) {
      const length = token.content.length
      if (!length) {
        continue
      }
      const end = start + length
      const path = [...blockPath, index, 0]

      decorations.push({
        anchor: { path, offset: start },
        focus: { path, offset: end },
        token: true,
        ...Object.fromEntries(token.types.map(typ => [typ, true])),
      })

      start = end
    }
  }
  return decorations
}
