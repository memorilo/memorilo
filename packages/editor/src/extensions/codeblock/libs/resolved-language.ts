interface CodeBlockLanguageAttrs {
  language?: unknown
  guess?: unknown
}

export const CODE_BLOCK_AUTO_LANGUAGE = 'auto'

/**
 * Returns the user's current selection, not the effective runtime language.
 *
 * This is used by places that need to preserve the editor state as selected by
 * the user, such as the language picker UI and the guess scheduler.
 *
 * In `auto` mode this must still return `auto`, even if `guess` or
 * `defaultLanguage` would resolve to some concrete language.
 */
export function getCodeBlockSelectedLanguage(attrs: Pick<CodeBlockLanguageAttrs, 'language'>) {
  return (typeof attrs.language === 'string' && attrs.language) || CODE_BLOCK_AUTO_LANGUAGE
}

/**
 * Returns the effective language used by runtime features.
 *
 * This is used by places that need the final language after applying fallback
 * rules: explicit language > guessed language > default language.
 *
 * It intentionally differs from `getCodeBlockSelectedLanguage()` because in
 * `auto` mode the selected value should remain `auto`, while the resolved value
 * may become `ts`, `js`, etc. This function also keeps compatibility with old
 * documents where `language` may still be `null`.
 */
export function getCodeBlockResolvedLanguage(
  attrs: CodeBlockLanguageAttrs,
  defaultLanguage: string | null | undefined,
) {
  const selectedLanguage = typeof attrs.language === 'string' && attrs.language

  return (selectedLanguage && selectedLanguage !== CODE_BLOCK_AUTO_LANGUAGE ? selectedLanguage : null)
    || (typeof attrs.guess === 'string' && attrs.guess)
    || defaultLanguage
    || null
}
