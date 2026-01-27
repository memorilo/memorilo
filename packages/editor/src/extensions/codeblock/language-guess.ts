import type { ModelOperations } from '@vscode/vscode-languagedetection'
import { readResource, readResourceText } from '@memorilo/api/file'
import { Data, Effect, Option, pipe } from 'effect'

export class LanguageDetectionError extends Data.TaggedError('LanguageDetectionError')<{
  message: string
  cause: unknown
}> {}

let languagedetectionModel: ModelOperations | undefined

const readModelJsonEffect = readResourceText('models/vscode-languagedetection.json').pipe(
  Effect.map(JSON.parse),
)
const readModelWeightEffect = readResource('models/vscode-languagedetection.bin').pipe(
  Effect.map(buf => buf.buffer),
)

const loadModelEffect = Effect.tryPromise({
  try: async () => {
    if (!languagedetectionModel) {
      // The model is large; keep a single instance for the session.
      const { ModelOperations } = await import('@vscode/vscode-languagedetection')
      languagedetectionModel = new ModelOperations({
        modelJsonLoaderFunc: () => Effect.runPromise(readModelJsonEffect),
        weightsLoaderFunc: () => Effect.runPromise(readModelWeightEffect),
      })
    }
    return languagedetectionModel
  },
  catch: cause =>
    new LanguageDetectionError({
      message: 'Failed to load language detection model',
      cause,
    }),
})

function runPrediction(code: string) {
  return Effect.gen(function* () {
    const model = yield* loadModelEffect
    return yield* Effect.tryPromise({
      try: () => model.runModel(code),
      catch: cause =>
        new LanguageDetectionError({
          message: 'Language detection failed during prediction',
          cause,
        }),
    })
  })
}

export function guessLanguage(code: string) {
  return Effect.gen(function* () {
    const trimmed = pipe(
      Option.fromNullable(code),
      Option.map(text => text.trim()),
      Option.filter(text => text.length > 0),
      Option.getOrNull,
    )
    if (!trimmed) {
      return []
    }
    return yield* runPrediction(trimmed)
  })
}
