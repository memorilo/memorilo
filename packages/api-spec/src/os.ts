import { Data, Effect } from 'effect'

export class DetectLanguageError extends Data.TaggedError('DetectLanguageError')<{
  readonly cause: unknown
}> {}

export class OSService extends Effect.Tag('OSService')<OSService, {
  readonly detectLanguage: <S extends ReadonlyArray<string>, F extends string>(
    supportedLocales: S,
    fallback: () => F,
  ) => Effect.Effect<S[number] | F, DetectLanguageError>
}>() {}
