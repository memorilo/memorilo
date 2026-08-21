export type { AppRouteHandlers } from './app-routes'
export { RuntimeInfoSchema } from './app-routes'
export type { DesktopHonoClient } from './client'
export { createDesktopApiClient, createDesktopHonoClient } from './client'
export type { ConfigurationRouteHandlers } from './configuration-routes'
export type * from './contract'
export type {
  DesktopHonoRequestContextHandler,
  DesktopOperationHandlers,
} from './operations'
export { withDesktopHonoRequestContext } from './operations'
export type { DesktopP2pDiscoveredPeer, DesktopP2pLocalDevice, DesktopP2pPairedDevice, DesktopP2pPairingRequest, DesktopP2pStatus } from './p2p-contract'
export type {
  DesktopHonoFailure,
} from './wire'
export {
  decodeDesktopHonoResponse,
  DesktopHonoError,
  DesktopHonoProtocolError,
} from './wire'
