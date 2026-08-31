import type { DesktopP2pStatus, DesktopSyncServerEvent } from '@memorilo/desktop-api'
import type { DesktopSyncServerConfiguration } from '@memorilo/desktop-config'
import { describe, expect, it, vi } from 'vitest'
import { createSyncServerStatusController } from './sync-server-status'

function serverConfiguration(
  overrides: Partial<DesktopSyncServerConfiguration> = {},
): DesktopSyncServerConfiguration {
  return {
    enabled: true,
    generation: 0,
    membershipEpoch: 1,
    modes: ['relay'],
    peerId: 'server-peer',
    policyEpoch: 0,
    url: 'ws://127.0.0.1:6000',
    ...overrides,
  }
}

function p2pStatus(
  state: DesktopP2pStatus['devices'][number]['state'],
  error: string | null = null,
): DesktopP2pStatus {
  return {
    connectedPeers: state === 'paused' ? [] : ['server-peer'],
    devices: [{
      deviceId: 'server-device',
      deviceName: 'Sync Server',
      error,
      peerId: 'server-peer',
      state,
    }],
    discoveredPeers: [],
    error: null,
    peerId: 'local-peer',
    state: 'ready',
  }
}

describe('sync server status controller', () => {
  it('publishes connection, policy and reset events without exposing credentials', () => {
    let configuration = serverConfiguration()
    const events: DesktopSyncServerEvent[] = []
    const publish = vi.fn((event: DesktopSyncServerEvent) => events.push(event))
    const controller = createSyncServerStatusController({
      configuration: () => configuration,
      credentialAvailable: () => true,
      publish,
      runtimeConfiguration: configuration,
    })

    expect(controller.getStatus()).toMatchObject({ state: 'connecting', modes: ['relay'] })
    expect(controller.getStatus()).not.toHaveProperty('credential')

    controller.updateP2pStatus(p2pStatus('synced'))
    expect(events.at(-1)).toMatchObject({ status: { state: 'synced' }, type: 'status' })

    const previous = configuration
    configuration = serverConfiguration({
      generation: 1,
      modes: ['authoritative'],
      policyEpoch: 1,
    })
    controller.publishRemoteStateChange(previous, configuration)

    expect(events.map(event => event.type)).toEqual([
      'status',
      'status',
      'account-data-reset',
      'policy-changed',
    ])
    expect(events.at(-2)).toMatchObject({ previousGeneration: 0, status: { generation: 1 } })
    expect(events.at(-1)).toMatchObject({ previousPolicyEpoch: 0, status: { policyEpoch: 1 } })
  })

  it('requires a restart when the configured server topology changes', () => {
    let configuration = serverConfiguration()
    const controller = createSyncServerStatusController({
      configuration: () => configuration,
      credentialAvailable: () => true,
      publish: vi.fn(),
      runtimeConfiguration: configuration,
    })

    configuration = serverConfiguration({ url: 'wss://sync.example.test' })
    controller.refreshConfiguration()

    expect(controller.getStatus()).toMatchObject({
      configured: true,
      state: 'restart-required',
      url: 'wss://sync.example.test',
    })
  })

  it('publishes one reset event when the server rejects a stale generation', () => {
    const configuration = serverConfiguration()
    const publish = vi.fn<(event: DesktopSyncServerEvent) => void>()
    const controller = createSyncServerStatusController({
      configuration: () => configuration,
      credentialAvailable: () => true,
      publish,
      runtimeConfiguration: configuration,
    })

    const resetError = p2pStatus('error', 'Memorilo sync rejected: account-data-reset')
    controller.updateP2pStatus(resetError)
    controller.updateP2pStatus(p2pStatus('connecting'))
    controller.updateP2pStatus(resetError)

    expect(publish.mock.calls.map(([event]) => event.type)).toEqual([
      'status',
      'account-data-reset',
      'status',
      'status',
    ])
  })
})
