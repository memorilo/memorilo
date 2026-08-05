import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Locale resources live at the repository root: `locales/<namespace>/<lang>.json`.
// This package has no vitest config, so it runs in node mode and can read the
// files directly without pulling in the renderer's browser-only i18n stack.
const LOCALES_ROOT = new URL('../../../locales/', import.meta.url)

interface LocaleFile {
  namespace: string
  language: string
  entries: Record<string, unknown>
}

function collectLocales(): { namespaces: string[], languages: string[], files: LocaleFile[] } {
  const namespaces = readdirSync(LOCALES_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()

  const files: LocaleFile[] = []
  const languages = new Set<string>()

  for (const namespace of namespaces) {
    const namespaceDir = new URL(`${namespace}/`, LOCALES_ROOT)
    for (const file of readdirSync(namespaceDir)) {
      if (!file.endsWith('.json'))
        continue
      const language = file.slice(0, -'.json'.length)
      const entries = JSON.parse(
        readFileSync(join(fileURLToPath(namespaceDir), file), 'utf8'),
      ) as Record<string, unknown>
      languages.add(language)
      files.push({ namespace, language, entries })
    }
  }

  return { namespaces, languages: [...languages].sort(), files }
}

/**
 * Flattens a nested translation object into a set of dot-paths, so nested keys
 * (e.g. `groups.editing.title`) participate in the completeness check. Arrays are
 * treated as opaque values, so only their key (not their contents) is compared.
 */
function flattenedKeys(entries: Record<string, unknown>): Set<string> {
  const keys = new Set<string>()
  const walk = (value: Record<string, unknown>, prefix: string) => {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
        walk(child as Record<string, unknown>, path)
        continue
      }
      keys.add(path)
    }
  }
  for (const [key, child] of Object.entries(entries)) {
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      walk(child as Record<string, unknown>, key)
      continue
    }
    keys.add(key)
  }
  return keys
}

const { namespaces, languages, files } = collectLocales()

describe('locale completeness', () => {
  it('defines at least one locale namespace', () => {
    expect(namespaces.length).toBeGreaterThan(0)
  })

  it('defines at least one supported language', () => {
    expect(languages.length).toBeGreaterThan(0)
  })
})

for (const namespace of namespaces) {
  // The first available language in sorted order is the completeness reference.
  const referenceLanguage = languages[0]!
  const reference = files.find(f => f.namespace === namespace && f.language === referenceLanguage)

  describe(`locale namespace "${namespace}"`, () => {
    if (!reference) {
      it(`has a locale file for the reference language "${referenceLanguage}"`, () => {
        throw new Error(
          `Missing ${namespace}/${referenceLanguage}.json — cannot establish a completeness reference.`,
        )
      })
      return
    }

    for (const language of languages) {
      const file = files.find(f => f.namespace === namespace && f.language === language)

      if (!file) {
        it(`has a locale file for "${language}"`, () => {
          throw new Error(`Missing ${namespace}/${language}.json`)
        })
        continue
      }

      if (language === referenceLanguage)
        continue

      const expected = flattenedKeys(reference.entries)
      const actual = flattenedKeys(file.entries)

      it(`"${language}" covers every key present in "${referenceLanguage}"`, () => {
        const missing = [...expected].filter(key => !actual.has(key)).sort()
        expect(missing).toEqual([])
      })

      it(`"${language}" has no keys missing from "${referenceLanguage}"`, () => {
        const extra = [...actual].filter(key => !expected.has(key)).sort()
        expect(extra).toEqual([])
      })
    }
  })
}
