import type { Console as EffectConsoleType } from 'effect/Console'
import * as tauriLog from '@tauri-apps/plugin-log'
import { Effect } from 'effect'
import * as EffectConsole from 'effect/Console'

function formatLogArg(arg: unknown) {
  if (arg instanceof Error) {
    const stack = arg.stack ? `\n${arg.stack}` : ''
    return `${arg.name}: ${arg.message}${stack}`
  }
  if (typeof arg === 'string') {
    return arg
  }
  try {
    return JSON.stringify(arg)
  }
  catch {
    return String(arg)
  }
}

function formatLogArgs(args: ReadonlyArray<unknown>) {
  if (args.length === 0) {
    return ''
  }
  return args.map(formatLogArg).join(' ')
}

function logEffect(fn: (message: string) => Promise<void>) {
  return (...args: ReadonlyArray<unknown>) => Effect.promise(() => fn(formatLogArgs(args)))
}

function unsafeLog(fn: (message: string) => Promise<void>) {
  return (...args: ReadonlyArray<unknown>) => {
    fn(formatLogArgs(args)).catch((error) => {
      tauriLog.error(formatLogArgs([error]))
    })
  }
}

const debugEffect = logEffect(tauriLog.debug)
const infoEffect = logEffect(tauriLog.info)
const warnEffect = logEffect(tauriLog.warn)
const errorEffect = logEffect(tauriLog.error)
const traceEffect = logEffect(tauriLog.trace)

const unsafeDebug = unsafeLog(tauriLog.debug)
const unsafeInfo = unsafeLog(tauriLog.info)
const unsafeWarn = unsafeLog(tauriLog.warn)
const unsafeError = unsafeLog(tauriLog.error)
const unsafeTrace = unsafeLog(tauriLog.trace)

const unsafeConsole = {
  assert: (condition: boolean, ...args: ReadonlyArray<unknown>) => {
    if (!condition) {
      unsafeError(...(args.length > 0 ? args : ['Assertion failed']))
    }
  },
  clear: () => {
    unsafeDebug('[console.clear]')
  },
  count: (label?: string) => {
    unsafeDebug('[console.count]', label)
  },
  countReset: (label?: string) => {
    unsafeDebug('[console.countReset]', label)
  },
  debug: unsafeDebug,
  dir: (item: unknown, options?: unknown) => {
    unsafeDebug('[console.dir]', item, options)
  },
  dirxml: (...args: ReadonlyArray<unknown>) => {
    unsafeDebug('[console.dirxml]', ...args)
  },
  error: unsafeError,
  group: (...args: ReadonlyArray<unknown>) => {
    unsafeDebug('[console.group]', ...args)
  },
  groupCollapsed: (...args: ReadonlyArray<unknown>) => {
    unsafeDebug('[console.groupCollapsed]', ...args)
  },
  groupEnd: () => {
    unsafeDebug('[console.groupEnd]')
  },
  info: unsafeInfo,
  log: unsafeInfo,
  table: (tabularData: unknown, properties?: ReadonlyArray<string>) => {
    unsafeDebug('[console.table]', tabularData, properties)
  },
  time: (label?: string) => {
    unsafeDebug('[console.time]', label)
  },
  timeEnd: (label?: string) => {
    unsafeDebug('[console.timeEnd]', label)
  },
  timeLog: (label?: string, ...args: ReadonlyArray<unknown>) => {
    unsafeDebug('[console.timeLog]', label, ...args)
  },
  trace: unsafeTrace,
  warn: unsafeWarn,
}

export const consoleHandlers: EffectConsoleType = {
  [EffectConsole.TypeId]: EffectConsole.TypeId,
  assert: (condition, ...args) => condition
    ? Effect.void
    : errorEffect(...(args.length > 0 ? args : ['Assertion failed'])),
  clear: debugEffect('[console.clear]'),
  count: (label?: string) => debugEffect('[console.count]', label),
  countReset: (label?: string) => debugEffect('[console.countReset]', label),
  debug: debugEffect,
  dir: (item: unknown, options?: unknown) => debugEffect('[console.dir]', item, options),
  dirxml: (...args: ReadonlyArray<unknown>) => debugEffect('[console.dirxml]', ...args),
  error: errorEffect,
  group: (options?: { label?: string | undefined, collapsed?: boolean | undefined }) =>
    debugEffect('[console.group]', options),
  groupEnd: debugEffect('[console.groupEnd]'),
  info: infoEffect,
  log: infoEffect,
  table: (tabularData: unknown, properties?: ReadonlyArray<string>) =>
    debugEffect('[console.table]', tabularData, properties),
  time: (label?: string) => debugEffect('[console.time]', label),
  timeEnd: (label?: string) => debugEffect('[console.timeEnd]', label),
  timeLog: (label?: string, ...args: ReadonlyArray<unknown>) =>
    debugEffect('[console.timeLog]', label, ...args),
  trace: traceEffect,
  warn: warnEffect,
  unsafe: unsafeConsole,
}
