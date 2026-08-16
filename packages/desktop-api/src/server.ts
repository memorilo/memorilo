import type { AppRouteHandlers } from './app-routes'
import type { ConfigurationRouteHandlers } from './configuration-routes'
import type { DesktopOperationHandlers } from './operations'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createAppRoutes } from './app-routes'
import { createConfigurationRoutes } from './configuration-routes'
import { createDesktopRpcRoutes } from './rpc-routes'
import {
  desktopHonoFailure,
  DesktopHonoRequestError,
} from './wire'

export type DesktopHonoHandlers<RequestContext = unknown> = DesktopOperationHandlers<RequestContext> & {
  app: AppRouteHandlers
  configuration: ConfigurationRouteHandlers
}

export interface DesktopHonoAppOptions {
  allowedOrigins: ReadonlySet<string>
}

function requestOperation(path: string): string {
  return path.replace(/^\/+|\/+$/gu, '').replaceAll('/', '.') || 'unknown'
}

export function createDesktopHonoApp<RequestContext>(
  handlers: DesktopHonoHandlers<RequestContext>,
  options: DesktopHonoAppOptions,
) {
  const app = new Hono()
  app.use('*', cors({
    origin: (origin) => {
      if (options.allowedOrigins.has(origin))
        return origin
      return undefined
    },
  }))
  app.onError((error, context) => {
    const operation = error instanceof DesktopHonoRequestError
      ? error.operation
      : requestOperation(context.req.path)
    const status = error instanceof DesktopHonoRequestError ? error.status : 500
    return context.json(desktopHonoFailure(operation, error), status)
  })
  app.notFound(context => context.json(desktopHonoFailure(
    requestOperation(context.req.path),
    new DesktopHonoRequestError(
      requestOperation(context.req.path),
      `Unknown desktop request route: ${context.req.method} ${context.req.path}`,
      { code: 'RouteNotFound', status: 404 },
    ),
  ), 404))
  return app
    .route('/app', createAppRoutes(handlers.app))
    .route('/configuration', createConfigurationRoutes(handlers.configuration))
    .route('/rpc', createDesktopRpcRoutes(handlers))
}

export type DesktopHonoApp = ReturnType<typeof createDesktopHonoApp>
