import type {
  DesktopHonoRequestContextHandler,
  DesktopOperationHandlers,
} from '@memorilo/desktop-api'
import type { WebContents } from 'electron'
import { withDesktopHonoRequestContext } from '@memorilo/desktop-api'

export interface DesktopRequestContext {
  sender: WebContents
}

export type DesktopRequestHandlers = DesktopOperationHandlers<DesktopRequestContext>

export function withDesktopRequestContext<Arguments extends readonly unknown[], Result>(
  invoke: (context: DesktopRequestContext, ...args: Arguments) => Promise<Result> | Result,
): DesktopHonoRequestContextHandler<Arguments, Result, DesktopRequestContext> {
  return withDesktopHonoRequestContext(invoke)
}
