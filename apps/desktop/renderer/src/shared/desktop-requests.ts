import type { DesktopFetchRequest } from '@memorilo/desktop-api/transport'
import { createDesktopApiClient } from '@memorilo/desktop-api'

async function contextualRequest(request: DesktopFetchRequest) {
  if (typeof window.desktop === 'undefined')
    throw new Error('Electron request context is unavailable in this renderer')
  return window.desktop.request(request)
}

export const desktopRequests = createDesktopApiClient({
  contextualTransport: contextualRequest,
})
