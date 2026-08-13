import type { DesktopIpcClient } from '@memorilo/desktop-preload/ipc'
import type { WebContents } from 'electron'
import { desktopIpcChannels } from '@memorilo/desktop-preload/ipc'
import {
  createOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'

export interface IpcInvocationContext {
  sender: WebContents
}

interface ContextualIpcHandler<Arguments extends readonly unknown[], Result> {
  readonly invoke: (
    context: IpcInvocationContext,
    ...args: Arguments
  ) => Promise<Result> | Result
}

type PlainIpcHandler<Method> = Method extends (...args: infer Arguments) => Promise<infer Result>
  ? (...args: Arguments) => Promise<Result> | Result
  : never

type ContextualHandlerFor<Method> = Method extends (...args: infer Arguments) => Promise<infer Result>
  ? ContextualIpcHandler<Arguments, Result>
  : never

type PlainDesktopIpcHandlers = {
  readonly [Group in keyof DesktopIpcClient]: {
    readonly [Method in keyof DesktopIpcClient[Group]]: PlainIpcHandler<DesktopIpcClient[Group][Method]>
  }
}

export type DesktopIpcHandlers = Omit<PlainDesktopIpcHandlers, 'assets' | 'books' | 'window'> & {
  readonly assets: Omit<PlainDesktopIpcHandlers['assets'], 'reclaim'> & {
    readonly reclaim: ContextualHandlerFor<DesktopIpcClient['assets']['reclaim']>
  }
  readonly books: Omit<
    PlainDesktopIpcHandlers['books'],
    'closeReadingSession' | 'createContext' | 'rebindContext' | 'selectContext'
  > & {
    readonly closeReadingSession: ContextualHandlerFor<DesktopIpcClient['books']['closeReadingSession']>
    readonly createContext: ContextualHandlerFor<DesktopIpcClient['books']['createContext']>
    readonly rebindContext: ContextualHandlerFor<DesktopIpcClient['books']['rebindContext']>
    readonly selectContext: ContextualHandlerFor<DesktopIpcClient['books']['selectContext']>
  }
  readonly window: {
    readonly showColumnVisibilityMenu: ContextualHandlerFor<DesktopIpcClient['window']['showColumnVisibilityMenu']>
  }
}

export interface IpcHandlerHost {
  handle: (
    channel: string,
    handler: (event: { sender: WebContents }, ...args: unknown[]) => unknown,
  ) => void
  removeHandler: (channel: string) => void
}

export interface IpcHandlerRegistry {
  close: () => Promise<void>
}

type RuntimeHandler
  = | ((...args: unknown[]) => unknown)
    | ContextualIpcHandler<readonly unknown[], unknown>

export function withIpcContext<Arguments extends readonly unknown[], Result>(
  invoke: (
    context: IpcInvocationContext,
    ...args: Arguments
  ) => Promise<Result> | Result,
): ContextualIpcHandler<Arguments, Result> {
  return { invoke }
}

function invokeHandler(
  handler: RuntimeHandler,
  context: IpcInvocationContext,
  args: unknown[],
): unknown {
  return typeof handler === 'function'
    ? handler(...args)
    : handler.invoke(context, ...args)
}

export async function createIpcHandlerRegistry(
  handlers: DesktopIpcHandlers,
  options: { host: IpcHandlerHost },
): Promise<IpcHandlerRegistry> {
  const admission = createOperationSupervisor('Desktop IPC transport', {
    closedError: () => new Error('Desktop IPC transport is shutting down'),
    concurrency: 'unbounded',
  })
  const resources = createResourceScope('Desktop IPC registry', { closeMode: 'dependent' })
  // Handlers are registered after admission. Dependent reverse-order cleanup
  // therefore drains accepted calls before unregistering their channels.
  resources.own({ close: admission.close, name: 'Desktop IPC admission' })

  try {
    for (const [groupName, groupChannels] of Object.entries(desktopIpcChannels)) {
      const groupHandlers = handlers[groupName as keyof DesktopIpcHandlers] as Record<string, RuntimeHandler>
      for (const [methodName, channel] of Object.entries(groupChannels)) {
        const handler = groupHandlers[methodName]
        if (handler === undefined)
          throw new Error(`Missing IPC handler for ${groupName}.${methodName}`)
        options.host.handle(channel, (event, ...args) => (
          admission.run(() => Promise.resolve(invokeHandler(handler, { sender: event.sender }, args)))
        ))
        resources.own({
          close: () => options.host.removeHandler(channel),
          name: `IPC handler ${channel}`,
        })
      }
    }
    resources.commit()
  }
  catch (error) {
    return resources.rollback(error)
  }
  return { close: resources.close }
}
