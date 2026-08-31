import type { DeviceId, PairedDevice, SyncPeerRole } from './model'

export interface PairingStore {
  readonly load: () => Promise<readonly PairedDevice[]>
  readonly save: (devices: readonly PairedDevice[]) => Promise<void>
}

export interface LocalDeviceIdentity {
  readonly deviceId: DeviceId
  deviceName: string
  membershipEpoch?: number
  peerId: string
  readonly role?: SyncPeerRole
}
