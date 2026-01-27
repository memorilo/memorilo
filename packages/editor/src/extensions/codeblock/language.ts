import { Option, pipe } from 'effect'
import { isString } from 'es-toolkit/predicate'

export interface CodeblockLanguageAttrs {
  language?: string
  guessLanguage?: string
}

function toLanguageOption(value: unknown) {
  return pipe(
    Option.fromNullable(value),
    Option.filter(isString),
    Option.filter(text => text.length > 0),
  )
}

export function getLanguageState(attrs: CodeblockLanguageAttrs) {
  const language = toLanguageOption(attrs.language)
  const guessLanguage = toLanguageOption(attrs.guessLanguage)
  const resolvedLanguage = pipe(
    language,
    Option.orElse(() => guessLanguage),
    Option.getOrElse(() => 'plain'),
  )

  return { language, guessLanguage, resolvedLanguage }
}

export function resolveLanguage(
  attrs: CodeblockLanguageAttrs,
  fallback: string = 'plain',
) {
  const { language, guessLanguage } = getLanguageState(attrs)
  return pipe(
    language,
    Option.orElse(() => guessLanguage),
    Option.getOrElse(() => fallback),
  )
}

function resolveLanguageClassPrefix(prefix: unknown) {
  return pipe(
    Option.fromNullable(prefix),
    Option.filter(isString),
    Option.filter(value => value.length > 0),
    Option.getOrElse(() => 'language-'),
  )
}

export function resolveLanguageClass(
  attrs: CodeblockLanguageAttrs,
  prefix: unknown,
) {
  const resolvedLanguage = resolveLanguage(attrs)
  return `${resolveLanguageClassPrefix(prefix)}${resolvedLanguage}`
}

export function isPlainLanguage(language: string) {
  return language === 'plain' || language === 'text' || language === 'txt'
}
