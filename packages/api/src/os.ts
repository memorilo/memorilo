import { locale } from '@tauri-apps/plugin-os'
import { Array as A, Data, Effect, Option } from 'effect'

export class DetectLanguageError extends Data.TaggedError('DetectLanguageError')<{
  readonly cause: unknown
}> {}

export function detectLanguage<S extends ReadonlyArray<string>, F extends string>(
  supportedLocales: S,
  fallback: () => F,
): Effect.Effect<S[number] | F, DetectLanguageError> {
  return Effect.gen(function* () {
    const systemLocale = yield* Effect.tryPromise({
      try: () => locale(),
      catch: cause => new DetectLanguageError({ cause }),
    })

    return Option.fromNullable(systemLocale).pipe(
      Option.map(l => l.replace('_', '-').toLowerCase()),
      Option.flatMap((normalized) => {
        const findMatch = (target: string) =>
          A.findFirst(supportedLocales, lang => lang.toLowerCase() === target)

        return findMatch(normalized).pipe(
          Option.orElse(() => findMatch(normalized.split('-')[0])),
        )
      }),
      Option.getOrElse(fallback),
    )
  })
}
