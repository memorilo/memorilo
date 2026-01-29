import type { NodeViewProps } from '@tiptap/react'
import type { ModelResult } from '@vscode/vscode-languagedetection'
import type { ComponentPropsWithoutRef } from 'react'
import log from '@memorilo/api/log'
import { cn } from '@memorilo/utils'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { Effect, Option, pipe } from 'effect'
import { maxBy } from 'es-toolkit/array'
import debounce from 'es-toolkit/compat/debounce'
import { isNotNil } from 'es-toolkit/predicate'
import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getLanguageState, resolveLanguageClass } from './language'
import { guessLanguage } from './language-guess'
import { LanguageSelector } from './language-selector'
import { loadLanguage, resolveLanguageId, supportedLanguages } from './prism'

function CodeViewContent(props: ComponentPropsWithoutRef<'code'>) {
  return NodeViewContent<'code'>({ as: 'code', ...props })
}
export function CodeBlockNodeView(props: NodeViewProps) {
  const { t } = useTranslation('app')
  const { node, extension, updateAttributes } = props
  const guessingRef = useRef(false)
  const { language, guessLanguage: guessedLanguageAttr } = getLanguageState(node.attrs)
  const languageClass = resolveLanguageClass(node.attrs, extension.options.languageClassPrefix)
  const baseAttributes = extension.options.HTMLAttributes ?? {}
  const { class: baseClassCandidate, ...restAttributes } = baseAttributes
  const baseClass = typeof baseClassCandidate === 'string' ? baseClassCandidate : undefined
  const languageValue = Option.getOrNull(language)
  const guessedLanguageValue = Option.getOrNull(guessedLanguageAttr)
  const textRef = useRef(node.textContent)
  const languageValueRef = useRef(languageValue)
  const guessedLanguageValueRef = useRef(guessedLanguageValue)
  const pendingGuessRef = useRef(false)
  const debouncedGuessRef = useRef<ReturnType<typeof debounce> | null>(null)
  languageValueRef.current = languageValue
  guessedLanguageValueRef.current = guessedLanguageValue
  const selectValue = pipe(language, Option.getOrElse(() => 'auto'))
  const languageOptions = [
    { id: 'auto', label: t('editor.codeblock.auto') },
    { id: 'plain', label: t('editor.codeblock.plain') },
    ...supportedLanguages.filter(language => language.id !== 'plain'),
  ]

  const handleLanguageChange = (value: string) => {
    const nextLanguage = value === 'auto' ? null : value
    const apply = () => updateAttributes({ language: nextLanguage })

    if (value !== 'plain' && value !== 'auto') {
      loadLanguage(value).then(apply).catch(apply)
      return
    }

    apply()
  }

  const shouldGuessText = useCallback((value: string) => {
    return pipe(
      Option.fromNullable(value),
      Option.map(text => text.trim()),
      Option.filter(text => text.length > 0),
      Option.match({
        onNone: () => false,
        onSome: () => true,
      }),
    )
  }, [])

  const runGuess = useCallback(() => {
    // Debounced guesses might overlap; keep the latest request queued.
    if (guessingRef.current) {
      pendingGuessRef.current = true
      return
    }

    const currentLanguage = languageValueRef.current
    if (currentLanguage) {
      return
    }

    const textSnapshot = textRef.current
    if (!shouldGuessText(textSnapshot)) {
      return
    }

    guessingRef.current = true
    const guessEffect = pipe(
      guessLanguage(textSnapshot),
      Effect.tapError(error =>
        Effect.sync(() => {
          void log.error(`codeblock guess error: ${formatErrorDetail(error)}`)
        }),
      ),
      Effect.mapError(error => new Error(`guess failed: ${formatErrorDetail(error)}`)),
    )

    // Run the model off the UI thread and update attrs when still relevant.
    void Effect.runPromise(guessEffect).then((predictions) => {
      if (languageValueRef.current || textRef.current !== textSnapshot) {
        return
      }

      const best = pickBestLanguage(predictions)
      const resultMessage = pipe(
        best,
        Option.match({
          onNone: () => 'codeblock guess result: none',
          onSome: candidate =>
            `codeblock guess result: ${candidate.languageId} (${candidate.confidence.toFixed(3)})`,
        }),
      )
      void log.info(resultMessage)
      pipe(
        best,
        Option.match({
          onNone: () => {
          },
          onSome: (candidate) => {
            pipe(
              Option.fromNullable(candidate.languageId),
              Option.filter(resolved => resolved !== guessedLanguageValueRef.current),
              Option.match({
                onNone: () => {},
                onSome: resolved => updateAttributes({ guessLanguage: resolved }),
              }),
            )
          },
        }),
      )
    }).finally(() => {
      guessingRef.current = false
      if (pendingGuessRef.current) {
        pendingGuessRef.current = false
        runGuess()
      }
    })
  }, [shouldGuessText, updateAttributes])

  useEffect(() => {
    // Run guesses only after 1s of inactivity to keep typing responsive.
    const debounced = debounce(() => runGuess(), 1000)
    debouncedGuessRef.current = debounced
    return () => {
      debounced.cancel()
    }
  }, [runGuess])

  const scheduleGuess = useCallback(() => {
    debouncedGuessRef.current?.()
  }, [])

  useEffect(() => {
    const currentText = node.textContent
    textRef.current = currentText
    if (languageValueRef.current) {
      return
    }
    if (!shouldGuessText(currentText)) {
      return
    }
    scheduleGuess()
  }, [node.textContent, scheduleGuess, shouldGuessText])

  useEffect(() => {
    if (languageValue) {
      return
    }
    if (!shouldGuessText(textRef.current)) {
      return
    }
    scheduleGuess()
  }, [languageValue, scheduleGuess, shouldGuessText])

  return (
    <NodeViewWrapper
      as="pre"
      className={cn(baseClass, languageClass, 'relative')}
      {...restAttributes}
    >
      <div className="absolute right-1 top-0 z-10" contentEditable={false}>
        <LanguageSelector
          value={selectValue}
          options={languageOptions}
          onSelect={handleLanguageChange}
        />
      </div>
      <CodeViewContent />
    </NodeViewWrapper>
  )
}

function pickBestLanguage(predictions: ModelResult[]) {
  const candidates = pipe(
    Option.fromNullable(predictions),
    Option.map(items => items.filter(isNotNil)),
    Option.map(items =>
      items.flatMap((item) => {
        return pipe(
          Option.fromNullable(resolveLanguageId(item.languageId)),
          Option.map(resolved => ({ ...item, languageId: resolved })),
          Option.match({
            onNone: () => [],
            onSome: candidate => [candidate],
          }),
        )
      }),
    ),
    Option.getOrElse((): ModelResult[] => []),
  )

  return pipe(
    Option.fromNullable(maxBy(candidates, candidate => candidate.confidence)),
  )
}

function formatErrorDetail(error: unknown) {
  if (error instanceof Error) {
    let stack = ''
    if (error.stack) {
      stack = `\n${error.stack}`
    }
    let detail = `${error.name}: ${error.message}${stack}`
    const causeValue = Reflect.get(error, 'cause')
    if (causeValue !== undefined && causeValue !== null) {
      const causeDetail = formatUnknownValue(causeValue)
      detail = `${detail}\nCause: ${causeDetail}`
    }
    return detail
  }
  return formatUnknownValue(error)
}

function formatUnknownValue(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}
