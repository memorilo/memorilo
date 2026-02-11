import type {
  EffectAssetsCommands,
  EffectDocCommands,
  EffectFolderCommands,
  EffectJournalCommands,
  EffectSettingsCommands,
  EffectSystemCommands,
  ToastEventApi,
} from '@memorilo/api-spec/command'
import {
  AssetsService,
  DialogService,
  DocService,
  FolderService,
  JournalService,
  SettingsService,
  SystemService,
  ToastEventService,
} from '@memorilo/api-spec/command'
import { FileService, ResourceReadError } from '@memorilo/api-spec/file'
import { OpenerService } from '@memorilo/api-spec/opener'
import { DetectLanguageError, OSService } from '@memorilo/api-spec/os'
import { Array as A, Effect, Layer, ManagedRuntime, Option } from 'effect'

const settingsKey = 'memorilo.settings'

function unsupportedCommands<T>(name: string) {
  return new Proxy({}, {
    get(_target, prop) {
      return (..._args: any[]) =>
        Effect.fail(new Error(`Command ${name}.${String(prop)} is not supported on web`))
    },
  }) as T
}

const effectFolderCommands: EffectFolderCommands = unsupportedCommands('FolderService')
const effectDocCommands: EffectDocCommands = unsupportedCommands('DocService')
const effectAssetsCommands: EffectAssetsCommands = unsupportedCommands('AssetsService')
const effectJournalCommands: EffectJournalCommands = unsupportedCommands('JournalService')

const effectSettingsCommands: EffectSettingsCommands = {
  readSettings: () => Effect.succeed(localStorage.getItem(settingsKey) ?? '{}'),
  updateSettings: (content: string) =>
    Effect.sync(() => {
      localStorage.setItem(settingsKey, content)
      return null
    }),
  saveSettings: () => Effect.succeed(null),
}

const effectSystemCommands: EffectSystemCommands = {
  getClientId: () => Effect.succeed('web'),
  getAppLocalDataDir: () => Effect.succeed(''),
  getGitCommitId: () => Effect.succeed(''),
  getDocNodesCount: () => Effect.succeed('0'),
  getDocUpdatesCount: () => Effect.succeed('0'),
}

const dialogService = {
  ask: async (message: string, options?: { title?: string }) => {
    const title = options?.title ? `${options.title}\n\n` : ''
    const confirmDialog = Reflect.get(window, 'confirm') as (value: string) => boolean
    return confirmDialog(`${title}${message}`)
  },
}

const toastEventService: ToastEventApi = {
  listen: async _cb => () => {},
}

const osService = {
  detectLanguage<S extends ReadonlyArray<string>, F extends string>(supportedLocales: S, fallback: () => F) {
    return Effect.gen(function* () {
      const systemLocale = yield* Effect.tryPromise({
        try: async () => navigator.language,
        catch: cause => new DetectLanguageError({ cause }),
      })

      return Option.fromNullable(systemLocale).pipe(
        Option.map(l => l.replace('_', '-').toLowerCase()),
        Option.flatMap((normalized) => {
          const findMatch = (target: string) =>
            A.findFirst(supportedLocales, lang => lang.toLowerCase() === target)

          return findMatch(normalized).pipe(
            Option.orElse(() => findMatch(normalized.split('-')[0] ?? normalized)),
          )
        }),
        Option.getOrElse(fallback),
      )
    })
  },
}

const fileService = {
  resolveResource: (path: string) =>
    Effect.try({
      try: () => new URL(path, window.location.origin).toString(),
      catch: cause =>
        new ResourceReadError({
          path,
          message: String(cause),
        }),
    }),
  readFile: (path: string) =>
    Effect.tryPromise({
      try: async () => {
        const res = await fetch(path)
        if (!res.ok) {
          throw new ResourceReadError({ path, message: `HTTP ${res.status}` })
        }
        const buffer = await res.arrayBuffer()
        return new Uint8Array(buffer)
      },
      catch: cause =>
        new ResourceReadError({
          path,
          message: String(cause),
        }),
    }),
}

const openerService = {
  openPath: (path: string) => Effect.sync(() => {
    window.open(path, '_blank')
  }),
  openUrl: (url: string | URL) => Effect.sync(() => {
    window.open(url.toString(), '_blank')
  }),
  revealItemInDir: (path: string | string[]) => Effect.sync(() => {
    const target = Array.isArray(path) ? path[0] : path
    window.open(target, '_blank')
  }),
}

const webLayer = Layer.mergeAll(
  Layer.succeed(FolderService, effectFolderCommands),
  Layer.succeed(SettingsService, effectSettingsCommands),
  Layer.succeed(DocService, effectDocCommands),
  Layer.succeed(SystemService, effectSystemCommands),
  Layer.succeed(AssetsService, effectAssetsCommands),
  Layer.succeed(JournalService, effectJournalCommands),
  Layer.succeed(DialogService, dialogService),
  Layer.succeed(ToastEventService, toastEventService),
  Layer.succeed(OSService, osService),
  Layer.succeed(FileService, fileService),
  Layer.succeed(OpenerService, openerService),
)

export const webRuntime = ManagedRuntime.make(webLayer)
