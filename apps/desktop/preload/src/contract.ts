import type {
  DesktopConfiguration,
  DesktopNoteExternalUpdate,
  DesktopP2pDiscoveredPeer,
  DesktopP2pLocalDevice,
  DesktopP2pPairedDevice,
  DesktopP2pPairingRequest,
  DesktopP2pStatus,
  DesktopWhiteboardLibraryData,
} from '@memorilo/desktop-api'
import type {
  DesktopFetchRequest,
  DesktopFetchResponse,
} from '@memorilo/desktop-api/transport'

export type * from '@memorilo/desktop-api'

export interface DesktopApi {
  loadWhiteboardLibrary: () => Promise<DesktopWhiteboardLibraryData>
  request: (request: DesktopFetchRequest) => Promise<DesktopFetchResponse>
  saveWhiteboardLibrary: (data: DesktopWhiteboardLibraryData) => Promise<void>
  p2p: {
    approvePairing: (requestId: string) => Promise<string>
    acceptInvitation: (invitation: string) => Promise<string>
    confirmPairing: (requestId: string, emoji: string) => Promise<DesktopP2pPairedDevice | null>
    completePairing: (response: string) => Promise<DesktopP2pPairedDevice>
    createInvitation: () => Promise<string>
    enableDiscovery: () => Promise<number>
    getLocalDevice: () => Promise<DesktopP2pLocalDevice>
    getPairingRequests: () => Promise<readonly DesktopP2pPairingRequest[]>
    getStatus: () => Promise<DesktopP2pStatus>
    listDevices: () => Promise<readonly DesktopP2pPairedDevice[]>
    listDiscoveredPeers: () => Promise<readonly DesktopP2pDiscoveredPeer[]>
    requestPairing: (peerId: string) => Promise<DesktopP2pPairingRequest>
    removeDevice: (deviceId: string) => Promise<void>
    updateDeviceName: (deviceName: string) => Promise<void>
  }
  subscribeConfiguration: (listener: (configuration: DesktopConfiguration) => void) => () => void
  subscribeLearningUpdates: (listener: () => void) => () => void
  subscribeNoteSaveRequests: (listener: () => Promise<void>) => () => void
  subscribeNoteUpdates: (listener: (update: DesktopNoteExternalUpdate) => void) => () => void
  subscribeP2pStatus: (listener: (status: DesktopP2pStatus) => void) => () => void
}
