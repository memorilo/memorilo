import type { DesktopMcpConfiguration } from '@memorilo/desktop-config'
import type { NoteApplicationService } from '../notes/note-application-service'
import { createOperationSupervisor, createResourceScope } from '@memorilo/effect-lifecycle'
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

export class McpServerControllerClosedError extends Error {
  constructor() {
    super('MCP server controller is closed')
    this.name = 'McpServerControllerClosedError'
  }
}

function rootLifecycleError(error: unknown): unknown {
  let current = error
  while (current instanceof Error && 'cause' in current && current.cause instanceof Error)
    current = current.cause
  return current
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
  let desiredConfiguration: DesktopMcpConfiguration | null = null
  let desiredVersion = 0
  let activeServer: {
    close: () => Promise<void>
  } | null = null
  const operations = createOperationSupervisor(
    'MCP server controller',
    { closedError: () => new McpServerControllerClosedError() },
  )
  let reconcilePromise: Promise<void> | undefined
  let requestedConfiguration: DesktopMcpConfiguration | null = null
  let requestedUpdate: Promise<void> | undefined

  const reportError = (error: unknown): void => {
    try {
      onError(error)
    }
    catch (reportError) {
      console.error('Failed to report MCP server error', reportError)
    }
  }

  const stopActiveServer = (): Promise<void> => {
    const current = activeServer
    if (!current)
      return Promise.resolve()
    return current.close().then(() => {
      if (activeServer === current) {
        activeServer = null
        activeConfiguration = null
      }
    })
  }

  const resources = createResourceScope('MCP server controller', {
    closeMode: 'dependent',
  })
  resources.own({ close: operations.close, name: 'MCP operations' })
  resources.own({
    close: async () => {
      try {
        await stopActiveServer()
      }
      catch (error) {
        const root = rootLifecycleError(error)
        reportError(root)
        throw root
      }
    },
    name: 'active MCP server',
  })
  resources.commit()

  const reconcile = async (): Promise<void> => {
    await Promise.resolve()
    while (true) {
      if (resources.isClosed())
        return
      const target = desiredConfiguration
      if (target === null)
        return
      const version = desiredVersion
      if (sameConfiguration(activeConfiguration, target))
        return

      await stopActiveServer()
      if (
        resources.isClosed()
        || version !== desiredVersion
        || !sameConfiguration(desiredConfiguration, target)
      ) {
        continue
      }
      if (!target.enabled) {
        activeConfiguration = target
        continue
      }

      let stop: () => Promise<void>
      try {
        stop = await start(target, notes)
      }
      catch (error) {
        if (
          resources.isClosed()
          || version !== desiredVersion
          || !sameConfiguration(desiredConfiguration, target)
        ) {
          continue
        }
        throw error
      }
      const serverResources = createResourceScope(`MCP server on port ${target.port}`, {
        closeMode: 'dependent',
      })
      serverResources.own({ close: stop, name: 'MCP transport' })
      serverResources.commit()
      // Claim the scope before deciding whether this start is still current.
      // Failed stale cleanup remains owned and retryable.
      activeServer = { close: serverResources.close }
      activeConfiguration = target
      if (resources.isClosed() || version !== desiredVersion || !sameConfiguration(desiredConfiguration, target)) {
        await stopActiveServer()
        continue
      }
    }
  }

  const ensureReconcile = (): Promise<void> => {
    if (reconcilePromise)
      return reconcilePromise
    const operation = operations.run(reconcile).catch((error) => {
      reconcilePromise = undefined
      requestedConfiguration = null
      requestedUpdate = undefined
      reportError(rootLifecycleError(error))
      throw error
    })
    reconcilePromise = operation
    void operation.then(
      () => {
        if (reconcilePromise === operation)
          reconcilePromise = undefined
      },
      () => {
        if (reconcilePromise === operation)
          reconcilePromise = undefined
      },
    )
    return operation
  }

  const update = (configuration: DesktopMcpConfiguration): Promise<void> => {
    if (resources.isClosed())
      return Promise.reject(new McpServerControllerClosedError())
    if (sameConfiguration(requestedConfiguration, configuration) && requestedUpdate)
      return requestedUpdate

    const target = { ...configuration }
    requestedConfiguration = target
    desiredConfiguration = target
    desiredVersion += 1
    requestedUpdate = ensureReconcile()
    return requestedUpdate
  }

  const close = (): Promise<void> => {
    if (!resources.isClosed()) {
      desiredConfiguration = null
      desiredVersion += 1
      requestedConfiguration = null
    }
    return resources.close()
  }

  return { close, update }
}

export type McpServerController = ReturnType<typeof createMcpServerController>
