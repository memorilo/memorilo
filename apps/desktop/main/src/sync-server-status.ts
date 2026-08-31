import type {
  DesktopP2pStatus,
  DesktopSyncServerEvent,
  DesktopSyncServerStatus,
} from '@memorilo/desktop-api'
import type { DesktopSyncServerConfiguration } from '@memorilo/desktop-config'

interface SyncServerRuntimeTopology {
  readonly enabled: boolean
  readonly peerId: string
  readonly url: string
}

export interface SyncServerStatusController {
  readonly getStatus: () => DesktopSyncServerStatus
  readonly publishRemoteStateChange: (
    previous: DesktopSyncServerConfiguration,
    next: DesktopSyncServerConfiguration,
  ) => void
  readonly refreshConfiguration: () => void
  readonly updateP2pStatus: (status: DesktopP2pStatus) => void
}

interface SyncServerStatusControllerOptions {
  readonly configuration: () => DesktopSyncServerConfiguration
  readonly credentialAvailable: () => boolean
  readonly publish: (event: DesktopSyncServerEvent) => void
  readonly runtimeConfiguration: DesktopSyncServerConfiguration
}

function configured(configuration: DesktopSyncServerConfiguration, credentialAvailable: boolean): boolean {
  return configuration.url.trim().length > 0
    && configuration.peerId.trim().length > 0
    && credentialAvailable
}

function sameModes(
  left: readonly ('relay' | 'authoritative')[],
  right: readonly ('relay' | 'authoritative')[],
): boolean {
  return left.length === right.length && left.every((mode, index) => mode === right[index])
}

function sameStatus(left: DesktopSyncServerStatus, right: DesktopSyncServerStatus): boolean {
  return left.enabled === right.enabled
    && left.configured === right.configured
    && left.state === right.state
    && left.peerId === right.peerId
    && left.url === right.url
    && sameModes(left.modes, right.modes)
    && left.generation === right.generation
    && left.membershipEpoch === right.membershipEpoch
    && left.policyEpoch === right.policyEpoch
    && left.error === right.error
}

function reportsAccountDataReset(
  p2pStatus: DesktopP2pStatus,
  configuration: DesktopSyncServerConfiguration,
): boolean {
  return configuration.enabled
    && p2pStatus.devices.some(device => device.peerId === configuration.peerId
      && device.state === 'error'
      && device.error?.includes('account-data-reset') === true)
}

function deriveStatus(
  configuration: DesktopSyncServerConfiguration,
  runtime: SyncServerRuntimeTopology,
  p2pStatus: DesktopP2pStatus | null,
  credentialAvailable: boolean,
): DesktopSyncServerStatus {
  const isConfigured = configured(configuration, credentialAvailable)
  const base = {
    configured: isConfigured,
    enabled: configuration.enabled,
    error: null,
    generation: configuration.generation,
    membershipEpoch: configuration.membershipEpoch,
    modes: [...configuration.modes],
    peerId: configuration.peerId.trim() || null,
    policyEpoch: configuration.policyEpoch,
    url: configuration.url.trim(),
  } as const

  if (!configuration.enabled)
    return { ...base, state: 'disabled' }
  if (!isConfigured)
    return { ...base, state: 'setup-required' }
  if (!runtime.enabled
    || runtime.peerId !== configuration.peerId
    || runtime.url !== configuration.url) {
    return { ...base, state: 'restart-required' }
  }
  if (p2pStatus === null || p2pStatus.state === 'starting')
    return { ...base, state: 'connecting' }
  if (p2pStatus.state === 'error')
    return { ...base, error: p2pStatus.error, state: 'error' }
  if (p2pStatus.state === 'stopped')
    return { ...base, state: 'offline' }

  const device = p2pStatus.devices.find(current => current.peerId === configuration.peerId)
  if (device?.state === 'error')
    return { ...base, error: device.error, state: 'error' }
  if (device?.state === 'syncing')
    return { ...base, state: 'syncing' }
  if (device?.state === 'synced')
    return { ...base, state: 'synced' }
  if (device?.state === 'connecting' || p2pStatus.connectedPeers.includes(configuration.peerId))
    return { ...base, state: 'connecting' }
  return { ...base, state: 'offline' }
}

export function createSyncServerStatusController(
  options: SyncServerStatusControllerOptions,
): SyncServerStatusController {
  const runtime: SyncServerRuntimeTopology = {
    enabled: options.runtimeConfiguration.enabled,
    peerId: options.runtimeConfiguration.peerId,
    url: options.runtimeConfiguration.url,
  }
  let p2pStatus: DesktopP2pStatus | null = null
  let resetErrorNotifiedGeneration: number | null = null
  let status = deriveStatus(options.configuration(), runtime, p2pStatus, options.credentialAvailable())

  const refresh = (): void => {
    const next = deriveStatus(options.configuration(), runtime, p2pStatus, options.credentialAvailable())
    if (sameStatus(status, next))
      return
    status = next
    options.publish({ status, type: 'status' })
  }

  return {
    getStatus: () => status,
    publishRemoteStateChange: (previous, next) => {
      refresh()
      if (next.generation !== previous.generation) {
        resetErrorNotifiedGeneration = null
        options.publish({
          previousGeneration: previous.generation,
          status,
          type: 'account-data-reset',
        })
      }
      if (next.policyEpoch !== previous.policyEpoch || !sameModes(next.modes, previous.modes)) {
        options.publish({
          previousPolicyEpoch: previous.policyEpoch,
          status,
          type: 'policy-changed',
        })
      }
    },
    refreshConfiguration: refresh,
    updateP2pStatus: (next) => {
      const configuration = options.configuration()
      p2pStatus = next
      refresh()
      if (reportsAccountDataReset(next, configuration)
        && resetErrorNotifiedGeneration !== configuration.generation) {
        resetErrorNotifiedGeneration = configuration.generation
        options.publish({
          previousGeneration: configuration.generation,
          status,
          type: 'account-data-reset',
        })
      }
    },
  }
}
