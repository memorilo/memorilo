import type { DesktopApi } from '@memorilo/desktop-preload'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopConfigurationContext } from '../shared/configuration'
import { P2pSettings } from './p2p-settings'

afterEach(() => {
  Reflect.deleteProperty(window, 'desktop')
  vi.clearAllMocks()
})

describe('p2p settings', () => {
  it('shows device names before, during and after pairing and edits the local display name', async () => {
    const updateDeviceName = vi.fn(async () => undefined)
    let syncServerListener: Parameters<DesktopApi['subscribeSyncServerEvents']>[0] | undefined
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        p2p: {
          approvePairing: vi.fn(),
          confirmPairing: vi.fn(),
          enableDiscovery: vi.fn(),
          getLocalDevice: vi.fn(async () => ({ deviceId: 'local', deviceName: 'host-mac', peerId: 'peer-local' })),
          getPairingRequests: vi.fn(async () => [{ deviceId: 'pairing', deviceName: 'Phone', emoji: '😀😎🥳🤖👻', peerId: 'peer-phone', requestId: 'request' }]),
          getServerStatus: vi.fn(async () => ({
            configured: true,
            enabled: true,
            error: null,
            generation: 2,
            membershipEpoch: 3,
            modes: ['relay'] as const,
            peerId: 'server-peer',
            policyEpoch: 4,
            state: 'synced' as const,
            url: 'wss://sync.example.test',
          })),
          getStatus: vi.fn(async () => ({ connectedPeers: [], discoveredPeers: [], error: null, peerId: 'peer-local', state: 'ready' as const })),
          listDevices: vi.fn(async () => [{ addedAt: 1, deviceId: 'paired', deviceName: 'Tablet', lastSeenAt: null, peerId: 'peer-tablet' }]),
          listDiscoveredPeers: vi.fn(async () => [{ deviceId: 'available', deviceName: 'Laptop', peerId: 'peer-laptop' }]),
          removeDevice: vi.fn(),
          requestPairing: vi.fn(),
          updateDeviceName,
        },
        subscribeSyncServerEvents: vi.fn((listener) => {
          syncServerListener = listener
          return vi.fn()
        }),
      } as unknown as DesktopApi,
    })

    const rendered = render(
      <DesktopConfigurationContext value={desktopConfigurationDefinition.defaults}>
        <P2pSettings />
      </DesktopConfigurationContext>,
    )

    const name = await rendered.findByRole('textbox', { name: 'This device name' })
    expect(name).toHaveValue('host-mac')
    expect(rendered.getByText('Laptop')).toBeInTheDocument()
    expect(rendered.getByText('Phone')).toBeInTheDocument()
    expect(rendered.getByText(/Tablet/)).toBeInTheDocument()
    expect(await rendered.findByText('Synced')).toBeInTheDocument()
    expect(rendered.getByText('Relay')).toBeInTheDocument()
    expect(rendered.getByText(/cannot restore anything while your other devices are offline/)).toBeInTheDocument()

    act(() => syncServerListener?.({
      previousGeneration: 1,
      status: {
        configured: true,
        enabled: true,
        error: null,
        generation: 2,
        membershipEpoch: 3,
        modes: ['authoritative'],
        peerId: 'server-peer',
        policyEpoch: 4,
        state: 'connecting',
        url: 'wss://sync.example.test',
      },
      type: 'account-data-reset',
    }))
    expect(rendered.getByRole('status')).toHaveTextContent('Local data remains on this device')

    fireEvent.change(name, { target: { value: 'Study Mac' } })
    fireEvent.click(rendered.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(updateDeviceName).toHaveBeenCalledWith('Study Mac'))
    expect(rendered.getByRole('status')).toHaveTextContent('Device name updated.')
    rendered.unmount()
  })
})
