import type { DesktopMcpConfiguration } from '@memorilo/desktop-config'
import type { NoteApplicationService } from '../notes/note-application-service'
import { startMcpHttpServer } from './mcp-http-server'

export type StartMcpServer = (
  configuration: DesktopMcpConfiguration,
  notes: NoteApplicationService,
) => Promise<() => Promise<void>>

function sameConfiguration(
  left: DesktopMcpConfiguration | null,
  right: DesktopMcpConfiguration,
): boolean {
  return left !== null
    && left.accessToken === right.accessToken
    && left.enabled === right.enabled
    && left.port === right.port
}

export function createMcpServerController(
  notes: NoteApplicationService,
  options: {
    onError?: (error: unknown) => void
    start?: StartMcpServer
  } = {},
) {
  const start = options.start ?? startMcpHttpServer
  const onError = options.onError ?? (error => console.error('Failed to update MCP server', error))
  let activeConfiguration: DesktopMcpConfiguration | null = null
  let requestedConfiguration: DesktopMcpConfiguration | null = null
  let stopServer: (() => Promise<void>) | null = null
  let operation = Promise.resolve()
  let closed = false

  const update = (configuration: DesktopMcpConfiguration): Promise<void> => {
    if (closed || sameConfiguration(requestedConfiguration, configuration))
      return operation

    const target = { ...configuration }
    requestedConfiguration = target
    operation = operation.then(async () => {
      if (closed || sameConfiguration(activeConfiguration, target))
        return

      if (stopServer) {
        const stop = stopServer
        await stop()
        if (stopServer === stop)
          stopServer = null
      }
      activeConfiguration = null

      if (target.enabled) {
        const stop = await start(target, notes)
        if (closed) {
          await stop()
          return
        }
        stopServer = stop
      }
      activeConfiguration = target
    }).catch((error) => {
      if (sameConfiguration(requestedConfiguration, target))
        requestedConfiguration = null
      onError(error)
    })
    return operation
  }

  const close = (): Promise<void> => {
    if (closed)
      return operation
    closed = true
    requestedConfiguration = null
    operation = operation.then(async () => {
      if (stopServer) {
        const stop = stopServer
        await stop()
        if (stopServer === stop)
          stopServer = null
      }
      activeConfiguration = null
    }).catch(onError)
    return operation
  }

  return { close, update }
}

export type McpServerController = ReturnType<typeof createMcpServerController>
