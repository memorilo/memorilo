import type { ModelOperations } from '@vscode/vscode-languagedetection'
import { runPromise } from '@memorilo/api-spec'
import { ResourceService } from '@memorilo/api-spec/services/resource'

import { Data, Effect, Option, pipe } from 'effect'

export class LanguageDetectionError extends Data.TaggedError('LanguageDetectionError')<{
  message: string
  cause: unknown
}> {}

let languagedetectionModel: ModelOperations | undefined

const readModelJsonEffect = Effect.gen(function* () {
  const json = yield* ResourceService.readLanguagedetectionModelJSON()
  return JSON.parse(json)
})
const readModelWeightEffect = Effect.gen(function* () {
  const weight = yield* ResourceService.readLanguagedetectionModelWeights()
  return new Uint8Array(weight).buffer
})

const loadModelEffect = Effect.tryPromise({
  try: async () => {
    if (!languagedetectionModel) {
      const { ModelOperations } = await import('@vscode/vscode-languagedetection')
      // The model is large; keep a single instance for the session.
      languagedetectionModel = new ModelOperations({
        modelJsonLoaderFunc: () => runPromise(readModelJsonEffect),
        weightsLoaderFunc: () => runPromise(readModelWeightEffect),
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
