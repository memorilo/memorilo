import type { DesktopP2pDiscoveredPeer, DesktopP2pLocalDevice, DesktopP2pPairedDevice, DesktopP2pPairingRequest, DesktopP2pStatus, DesktopSyncServerStatus } from '@memorilo/desktop-api'
import type { P2pApplication } from '@memorilo/sync/node'

function publicDevice(device: P2pApplication['pairing'] extends { list: () => readonly (infer Device)[] } ? Device : never): DesktopP2pPairedDevice {
  return {
    addedAt: device.addedAt,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    lastSeenAt: device.lastSeenAt,
    peerId: device.peerId,
  }
}

export function createP2pHandlers(
  application: P2pApplication,
  getSyncServerStatus: () => DesktopSyncServerStatus,
  installServerCredential: (credential: string) => Promise<void>,
) {
  return {
    approvePairing: (requestId: string): Promise<string> => application.approvePairing(requestId),
    acceptInvitation: (invitation: string, dialTarget?: string): Promise<string> => application.acceptInvitation(invitation, dialTarget),
    confirmPairing: async (requestId: string, emoji: string): Promise<DesktopP2pPairedDevice | null> => {
      const device = await application.confirmPairing(requestId, emoji)
      return device === null ? null : publicDevice(device)
    },
    completePairing: async (response: string): Promise<DesktopP2pPairedDevice> => publicDevice(await application.completePairing(response)),
    createInvitation: async (): Promise<string> => application.createInvitation(),
    enableDiscovery: (): Promise<number> => application.enableDiscovery(),
    getLocalDevice: (): DesktopP2pLocalDevice => application.localDevice(),
    getPairingRequests: async (): Promise<readonly DesktopP2pPairingRequest[]> => application.listPairingRequests(),
    getServerStatus: getSyncServerStatus,
    getStatus: (): DesktopP2pStatus => application.status(),
    installServerCredential,
    listDevices: (): readonly DesktopP2pPairedDevice[] => application.pairing.list().map(publicDevice),
    listDiscoveredPeers: async (): Promise<readonly DesktopP2pDiscoveredPeer[]> => application.discoveredPeers(),
    requestPairing: async (peerId: string) => application.requestPairing(peerId),
    removeDevice: (deviceId: string): Promise<void> => application.removeDevice(deviceId),
    updateDeviceName: (deviceName: string): Promise<void> => application.updateDeviceName(deviceName),
  }
}
