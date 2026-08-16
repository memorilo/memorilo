import {
  memoriloApiHost,
  memoriloAppHost,
  memoriloAssetHost,
  memoriloProtocol,
} from '@memorilo/desktop-api/transport'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { createAssetProtocolHandler } from './asset-protocol'
import { registerProtocol } from './protocol-registration'
import { createRendererProtocolHandler } from './renderer-protocol'

export interface MemoriloProtocolRegistration {
  close: () => Promise<void>
}

export interface RegisterMemoriloProtocolOptions {
  apiHandler: (request: Request) => Promise<Response> | Response
  assetDirectory: string | null
  rendererDirectory: string
}

class MemoriloProtocolClosingError extends Error {
  constructor() {
    super('Memorilo protocol is shutting down')
    this.name = 'MemoriloProtocolClosingError'
  }
}

function parseRequestUrl(request: Request): URL | Response {
  let url: URL
  try {
    url = new URL(request.url)
  }
  catch {
    return new Response(null, { status: 400 })
  }
  if (
    url.protocol !== `${memoriloProtocol}:`
    || url.username
    || url.password
    || url.port
  ) {
    return new Response(null, { status: 400 })
  }
  return url
}

export function createMemoriloProtocolHandler(options: RegisterMemoriloProtocolOptions) {
  const appHandler = createRendererProtocolHandler(options.rendererDirectory)
  const assetHandler = createAssetProtocolHandler(options.assetDirectory)

  return (request: Request): Promise<Response> | Response => {
    const parsed = parseRequestUrl(request)
    if (parsed instanceof Response)
      return parsed

    switch (parsed.host) {
      case memoriloApiHost:
        return options.apiHandler(request)
      case memoriloAppHost:
        return appHandler(request)
      case memoriloAssetHost:
        return assetHandler(request)
      default:
        return new Response(null, { status: 404 })
    }
  }
}

export async function registerMemoriloProtocol(
  options: RegisterMemoriloProtocolOptions,
): Promise<MemoriloProtocolRegistration> {
  const admission = createOperationSupervisor('Memorilo protocol', {
    closedError: () => new MemoriloProtocolClosingError(),
    concurrency: 'unbounded',
  })
  const dispatch = createMemoriloProtocolHandler(options)
  let registration
  try {
    registration = await registerProtocol(memoriloProtocol, async (request) => {
      try {
        return await admission.run(() => Promise.resolve(dispatch(request)))
      }
      catch (error) {
        if (error instanceof MemoriloProtocolClosingError)
          return new Response(null, { status: 503 })
        throw error
      }
    })
  }
  catch (error) {
    await admission.close()
    throw error
  }

  return {
    close: async () => {
      await admission.close()
      registration.close()
    },
  }
}
