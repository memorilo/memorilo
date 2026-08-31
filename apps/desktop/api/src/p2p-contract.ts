export interface DesktopP2pStatus {
  readonly state: 'stopped' | 'starting' | 'ready' | 'error'
  readonly peerId: string | null
  readonly connectedPeers: readonly string[]
  readonly devices: readonly DesktopP2pDeviceStatus[]
  readonly error: string | null
  readonly discoveredPeers: readonly DesktopP2pDiscoveredPeer[]
}

export const desktopSyncServerEventChannel = 'memorilo:sync-server-event'

export type DesktopSyncServerConnectionState
  = | 'disabled'
    | 'setup-required'
    | 'restart-required'
    | 'connecting'
    | 'syncing'
    | 'synced'
    | 'offline'
    | 'error'

export interface DesktopSyncServerStatus {
  readonly enabled: boolean
  readonly configured: boolean
  readonly state: DesktopSyncServerConnectionState
  readonly peerId: string | null
  readonly url: string
  readonly modes: readonly ('relay' | 'authoritative')[]
  readonly generation: number
  readonly membershipEpoch: number
  readonly policyEpoch: number
  readonly error: string | null
}

export type DesktopSyncServerEvent
  = | {
    readonly type: 'status'
    readonly status: DesktopSyncServerStatus
  }
  | {
    readonly type: 'policy-changed'
    readonly previousPolicyEpoch: number
    readonly status: DesktopSyncServerStatus
  }
  | {
    readonly type: 'account-data-reset'
    readonly previousGeneration: number
    readonly status: DesktopSyncServerStatus
  }

export interface DesktopP2pDeviceStatus {
  readonly deviceId: string
  readonly deviceName: string
  readonly peerId: string
  readonly state: 'connecting' | 'syncing' | 'synced' | 'paused' | 'error'
  readonly error: string | null
}

export interface DesktopP2pLocalDevice {
  readonly deviceId: string
  readonly deviceName: string
  readonly peerId: string
}

export interface DesktopP2pDiscoveredPeer {
  readonly deviceId: string
  readonly deviceName: string
  readonly peerId: string
}

export interface DesktopP2pPairingRequest {
  readonly requestId: string
  readonly deviceId: string
  readonly deviceName: string
  readonly peerId: string
  readonly emoji: string
}

export interface DesktopP2pPairedDevice {
  readonly deviceId: string
  readonly deviceName: string
  readonly peerId: string
  readonly addedAt: number
  readonly lastSeenAt: number | null
}
