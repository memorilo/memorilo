export interface DesktopP2pStatus {
  readonly state: 'stopped' | 'starting' | 'ready' | 'error'
  readonly peerId: string | null
  readonly connectedPeers: readonly string[]
  readonly error: string | null
  readonly discoveredPeers: readonly DesktopP2pDiscoveredPeer[]
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
