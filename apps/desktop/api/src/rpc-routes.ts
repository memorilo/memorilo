import type { Schema as EffectSchema } from 'effect'
import type {
  DesktopOperationGroup,
  DesktopOperationHandlers,
} from './operations'
import { Schema } from 'effect'
import { Hono } from 'hono'
import { validator } from 'hono/validator'
import { desktopOperationSchemas } from './operations'
import {
  decodeDesktopHonoInput,
  DesktopHonoRequestError,
  encodeDesktopHonoValue,
} from './wire'

interface DesktopHonoEnvironment<RequestContext> {
  Bindings: {
    requestContext?: RequestContext
  }
}

const RpcBodySchema = Schema.Struct({ args: Schema.Unknown })

function ownProperty(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

type RuntimeSchema = EffectSchema.Top & {
  readonly DecodingServices: never
  readonly EncodingServices: never
}

interface RuntimeOperationDefinition {
  readonly arguments: RuntimeSchema
  readonly contextual: boolean
  readonly result: RuntimeSchema
}

function operationDefinition(group: string, method: string): RuntimeOperationDefinition {
  if (!ownProperty(desktopOperationSchemas, group))
    throw new DesktopHonoRequestError(`rpc.${group}.${method}`, `Unknown desktop request group: ${group}`, { code: 'RouteNotFound', status: 404 })
  const groupSchemas = desktopOperationSchemas[group as DesktopOperationGroup] as unknown as Record<string, RuntimeOperationDefinition>
  if (!ownProperty(groupSchemas, method))
    throw new DesktopHonoRequestError(`rpc.${group}.${method}`, `Unknown desktop request method: ${group}.${method}`, { code: 'RouteNotFound', status: 404 })
  const definition = groupSchemas[method]
  if (definition === undefined)
    throw new Error(`Desktop request schema ${group}.${method} disappeared during lookup`)
  return definition
}

export function createDesktopRpcRoutes<RequestContext>(handlers: DesktopOperationHandlers<RequestContext>) {
  return new Hono<DesktopHonoEnvironment<RequestContext>>().post(
    '/:group/:method',
    validator('json', value => decodeDesktopHonoInput('rpc.request', RpcBodySchema, value)),
    async (context) => {
      const group = context.req.param('group')
      const method = context.req.param('method')
      const operation = `${group}.${method}`
      const definition = operationDefinition(group, method)
      const decoded = decodeDesktopHonoInput(
        operation,
        Schema.Struct({ args: definition.arguments }),
        context.req.valid('json'),
      )
      const args = decoded.args as readonly unknown[]
      const groupHandlers = handlers[group as DesktopOperationGroup] as Record<string, unknown>
      const handler = groupHandlers[method]
      if (handler === undefined)
        throw new Error(`Missing desktop request handler for ${operation}`)

      let result: unknown
      if (definition.contextual) {
        const requestContext = context.env.requestContext
        if (requestContext === undefined) {
          throw new DesktopHonoRequestError(
            operation,
            `Desktop request ${operation} requires an Electron request context`,
            { code: 'RequestContextRequired', status: 403 },
          )
        }
        if (typeof handler !== 'object' || handler === null || !('invoke' in handler) || typeof handler.invoke !== 'function')
          throw new Error(`Desktop request handler ${operation} is not contextual`)
        const contextualHandler = handler as { invoke: (context: RequestContext, ...args: unknown[]) => unknown }
        result = await contextualHandler.invoke(requestContext, ...args)
      }
      else {
        if (typeof handler !== 'function')
          throw new Error(`Desktop request handler ${operation} is unexpectedly contextual`)
        const plainHandler = handler as (...args: unknown[]) => unknown
        result = await plainHandler(...args)
      }

      return new Response(JSON.stringify(encodeDesktopHonoValue(operation, definition.result, result)), {
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        status: 200,
      })
    },
  )
}
