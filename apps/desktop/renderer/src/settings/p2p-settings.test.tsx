import type { DesktopApi } from '@memorilo/desktop-preload'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { P2pSettings } from './p2p-settings'

afterEach(() => {
  Reflect.deleteProperty(window, 'desktop')
  vi.clearAllMocks()
})

describe('p2p settings', () => {
  it('shows device names before, during and after pairing and edits the local display name', async () => {
    const updateDeviceName = vi.fn(async () => undefined)
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        p2p: {
          approvePairing: vi.fn(),
          confirmPairing: vi.fn(),
          enableDiscovery: vi.fn(),
          getLocalDevice: vi.fn(async () => ({ deviceId: 'local', deviceName: 'host-mac', peerId: 'peer-local' })),
          getPairingRequests: vi.fn(async () => [{ deviceId: 'pairing', deviceName: 'Phone', emoji: '😀😎🥳🤖👻', peerId: 'peer-phone', requestId: 'request' }]),
          getStatus: vi.fn(async () => ({ connectedPeers: [], discoveredPeers: [], error: null, peerId: 'peer-local', state: 'ready' as const })),
          listDevices: vi.fn(async () => [{ addedAt: 1, deviceId: 'paired', deviceName: 'Tablet', lastSeenAt: null, peerId: 'peer-tablet' }]),
          listDiscoveredPeers: vi.fn(async () => [{ deviceId: 'available', deviceName: 'Laptop', peerId: 'peer-laptop' }]),
          removeDevice: vi.fn(),
          requestPairing: vi.fn(),
          updateDeviceName,
        },
      } as unknown as DesktopApi,
    })

    const rendered = render(<P2pSettings />)

    const name = await rendered.findByRole('textbox', { name: 'This device name' })
    expect(name).toHaveValue('host-mac')
    expect(rendered.getByText('Laptop')).toBeInTheDocument()
    expect(rendered.getByText('Phone')).toBeInTheDocument()
    expect(rendered.getByText(/Tablet/)).toBeInTheDocument()

    fireEvent.change(name, { target: { value: 'Study Mac' } })
    fireEvent.click(rendered.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(updateDeviceName).toHaveBeenCalledWith('Study Mac'))
    expect(rendered.getByRole('status')).toHaveTextContent('Device name updated.')
  })
})
