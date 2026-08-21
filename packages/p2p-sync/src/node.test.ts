import type { SyncChange, VersionVector } from './model'
import type { P2pNodeHandle, SyncStateProvider } from './node'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { multiaddr } from '@multiformats/multiaddr'
import { afterEach, describe, expect, it } from 'vitest'
import { JsonSyncJournal } from './journal'
import { createP2pNode } from './node'
import { MemoryPairingStore, PairingManager } from './pairing'

describe('p2p communication', () => {
  const handles: Array<{ close: () => Promise<void> }> = []
  const temporaryDirectories: string[] = []

  async function waitFor(predicate: () => boolean, timeoutMs = 1_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 10))
    if (!predicate())
      throw new Error('Timed out waiting for p2p state')
  }

  async function connectPairedNodes(
    firstProvider: SyncStateProvider,
    secondProvider: SyncStateProvider,
  ): Promise<{ first: P2pNodeHandle, second: P2pNodeHandle }> {
    const firstPairing = new PairingManager({ deviceId: 'first', deviceName: 'First', peerId: '' }, new MemoryPairingStore())
    const secondPairing = new PairingManager({ deviceId: 'second', deviceName: 'Second', peerId: '' }, new MemoryPairingStore())
    await firstPairing.load()
    await secondPairing.load()
    const first = await createP2pNode({
      identity: firstPairing.identity,
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: firstPairing,
      provider: firstProvider,
      reconnectIntervalMs: 60_000,
    })
    const second = await createP2pNode({
      identity: secondPairing.identity,
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: secondPairing,
      provider: secondProvider,
      reconnectIntervalMs: 60_000,
    })
    handles.push(first, second)
    const firstPeerId = first.status().peerId
    const secondPeerId = second.status().peerId
    if (firstPeerId === null || secondPeerId === null)
      throw new Error('P2P peers did not start')
    firstPairing.identity.peerId = firstPeerId
    secondPairing.identity.peerId = secondPeerId
    const accepted = await secondPairing.acceptInvitation(firstPairing.createInvitation())
    await firstPairing.completeInvitation(accepted.response)
    const secondAddress = second.node.getMultiaddrs()[0]
    if (secondAddress === undefined)
      throw new Error('Second peer has no listen address')
    await first.node.dial(multiaddr(secondAddress.toString()))
    await first.syncPeer(secondPeerId)
    return { first, second }
  }

  afterEach(async () => {
    await Promise.all(handles.splice(0).map(handle => handle.close()))
    await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
  })

  it('starts a TCP node with Noise, Yamux and mDNS and exposes a stable peer id', async () => {
    const pairing = new PairingManager(
      { deviceId: 'device', deviceName: 'Device', peerId: 'peer' },
      new MemoryPairingStore(),
    )
    await pairing.load()
    const handle = await createP2pNode({
      identity: { deviceId: 'device', deviceName: 'Device' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing,
    })
    handles.push(handle)
    expect(handle.status()).toMatchObject({ state: 'ready' })
    expect(handle.status().peerId).toEqual(expect.any(String))
    expect(handle.status().connectedPeers).toEqual([])
  })

  it('connects paired peers and applies a change over the authenticated sync stream', async () => {
    const firstPairing = new PairingManager({ deviceId: 'first', deviceName: 'First', peerId: '' }, new MemoryPairingStore())
    const secondPairing = new PairingManager({ deviceId: 'second', deviceName: 'Second', peerId: '' }, new MemoryPairingStore())
    await firstPairing.load()
    await secondPairing.load()
    const received: string[] = []
    const observedEpochs: number[] = []
    const first = await createP2pNode({
      identity: { deviceId: 'first', deviceName: 'First' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: firstPairing,
      provider: {
        applyChanges: async () => undefined,
        getChanges: async since => since.first === 1 ? [] : [{ deviceId: 'first', id: 'change-1', kind: 'learning-mutation', payload: '{}', sequence: 1 }],
        getMembershipEpoch: () => 1,
        getVersionVector: () => ({ first: 1 }),
      },
    })
    const second = await createP2pNode({
      identity: { deviceId: 'second', deviceName: 'Second' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: secondPairing,
      provider: {
        applyChanges: async (changes) => {
          received.push(...changes.map(change => change.id))
        },
        observeMembershipEpoch: async (epoch) => {
          observedEpochs.push(epoch)
        },
        getChanges: async () => [],
        getMembershipEpoch: () => 3,
        getVersionVector: () => ({ first: received.length > 0 ? 1 : 0 }),
      },
    })
    handles.push(first, second)
    firstPairing.identity.peerId = first.status().peerId ?? ''
    secondPairing.identity.peerId = second.status().peerId ?? ''
    const accepted = await secondPairing.acceptInvitation(firstPairing.createInvitation())
    await firstPairing.completeInvitation(accepted.response)
    const secondListenAddress = second.node.getMultiaddrs()[0]
    if (secondListenAddress === undefined)
      throw new Error('Second peer has no listen address')
    const secondAddress = multiaddr(secondListenAddress.toString())
    await first.node.dial(secondAddress)
    const secondPeerId = second.status().peerId
    if (secondPeerId === null)
      throw new Error('Second peer did not start')
    await waitFor(() => received.length === 1)
    expect(received).toEqual(['change-1'])
    expect(observedEpochs).toContain(1)
  })

  it('synchronizes a change immediately after a connected peer is notified', async () => {
    const sourceChanges: SyncChange[] = []
    const received: SyncChange[] = []
    const { first } = await connectPairedNodes({
      applyChanges: async () => undefined,
      getChanges: async since => sourceChanges.filter(change => change.sequence > (since.first ?? 0)),
      getMembershipEpoch: () => 1,
      getVersionVector: () => ({ first: sourceChanges.length }),
    }, {
      applyChanges: async (changes) => {
        received.push(...changes)
      },
      getChanges: async () => [],
      getMembershipEpoch: () => 1,
      getVersionVector: () => ({ first: received.length }),
    })
    sourceChanges.push({
      deviceId: 'first',
      id: 'change-after-connect',
      kind: 'learning-mutation',
      payload: '{}',
      sequence: 1,
    })

    await first.notifyChangesAvailable()

    expect(received.map(change => change.id)).toEqual(['change-after-connect'])
  })

  it('does not report syncing for a fallback pass without changes', async () => {
    const firstPairing = new PairingManager({ deviceId: 'first', deviceName: 'First', peerId: '' }, new MemoryPairingStore())
    const secondPairing = new PairingManager({ deviceId: 'second', deviceName: 'Second', peerId: '' }, new MemoryPairingStore())
    await firstPairing.load()
    await secondPairing.load()
    let synchronizationChecks = 0
    const observedStates: string[] = []
    const provider = (): SyncStateProvider => ({
      applyChanges: async () => undefined,
      getChanges: async () => {
        synchronizationChecks += 1
        return []
      },
      getMembershipEpoch: () => 1,
      getVersionVector: () => ({}),
    })
    const first = await createP2pNode({
      identity: firstPairing.identity,
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      onStatus: status => observedStates.push(...status.devices.map(device => device.state)),
      pairing: firstPairing,
      provider: provider(),
      reconnectIntervalMs: 25,
    })
    const second = await createP2pNode({
      identity: secondPairing.identity,
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      onStatus: status => observedStates.push(...status.devices.map(device => device.state)),
      pairing: secondPairing,
      provider: provider(),
      reconnectIntervalMs: 25,
    })
    handles.push(first, second)
    const firstPeerId = first.status().peerId
    const secondPeerId = second.status().peerId
    if (firstPeerId === null || secondPeerId === null)
      throw new Error('P2P peers did not start')
    firstPairing.identity.peerId = firstPeerId
    secondPairing.identity.peerId = secondPeerId
    const accepted = await secondPairing.acceptInvitation(firstPairing.createInvitation())
    await firstPairing.completeInvitation(accepted.response)
    const initiator = firstPeerId < secondPeerId ? first : second
    const responder = firstPeerId < secondPeerId ? second : first
    const initiatorAddress = initiator.node.getMultiaddrs()[0]
    const initiatorPeerId = initiator.status().peerId
    const responderPeerId = responder.status().peerId
    if (initiatorAddress === undefined || initiatorPeerId === null || responderPeerId === null)
      throw new Error('Sync peers did not start')
    await responder.node.dial(multiaddr(initiatorAddress.toString()))
    await waitFor(() => initiator.status().connectedPeers.includes(responderPeerId))
    await initiator.syncPeer(responderPeerId)
    await waitFor(() => initiator.status().devices.some(device => device.state === 'synced'))

    const checksAfterInitialSync = synchronizationChecks
    observedStates.length = 0
    await waitFor(() => synchronizationChecks > checksAfterInitialSync)

    expect(observedStates).not.toContain('syncing')
  })

  it('runs another synchronization pass when a change arrives during an active pass', async () => {
    const sourceChanges: SyncChange[] = []
    const received: SyncChange[] = []
    let first: P2pNodeHandle | undefined
    let queuedSecondPass = false
    const connected = await connectPairedNodes({
      applyChanges: async () => undefined,
      getChanges: async since => sourceChanges.filter(change => change.sequence > (since.first ?? 0)),
      getMembershipEpoch: () => 1,
      getVersionVector: () => ({ first: sourceChanges.length }),
    }, {
      applyChanges: async (changes) => {
        received.push(...changes)
        if (!queuedSecondPass && changes.some(change => change.id === 'first-change')) {
          queuedSecondPass = true
          sourceChanges.push({
            deviceId: 'first',
            id: 'second-change',
            kind: 'learning-mutation',
            payload: '{}',
            sequence: 2,
          })
          void first?.notifyChangesAvailable()
        }
      },
      getChanges: async () => [],
      getMembershipEpoch: () => 1,
      getVersionVector: () => ({ first: received.length }),
    })
    first = connected.first
    sourceChanges.push({
      deviceId: 'first',
      id: 'first-change',
      kind: 'learning-mutation',
      payload: '{}',
      sequence: 1,
    })

    await first.notifyChangesAvailable()

    expect(received.map(change => change.id)).toEqual(['first-change', 'second-change'])
  })

  it('never synchronizes changes with an unpaired mDNS peer', async () => {
    const firstPairing = new PairingManager({ deviceId: 'first', deviceName: 'First', peerId: '' }, new MemoryPairingStore())
    const secondPairing = new PairingManager({ deviceId: 'second', deviceName: 'Second', peerId: '' }, new MemoryPairingStore())
    await firstPairing.load()
    await secondPairing.load()
    let requestedChanges = 0
    let appliedChanges = 0
    const first = await createP2pNode({
      identity: { deviceId: 'first', deviceName: 'First' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: firstPairing,
      pairingAvailability: () => Date.now() + 5 * 60 * 1000,
      provider: {
        applyChanges: async () => {
          appliedChanges += 1
        },
        getChanges: async () => {
          requestedChanges += 1
          return [{ deviceId: 'first', id: 'private-change', kind: 'learning-mutation', payload: '{}', sequence: 1 }]
        },
        getMembershipEpoch: () => 1,
        getVersionVector: () => ({ first: 1 }),
      },
    })
    const second = await createP2pNode({
      identity: { deviceId: 'second', deviceName: 'Second' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: secondPairing,
      provider: {
        applyChanges: async () => {
          appliedChanges += 1
        },
        getChanges: async () => {
          requestedChanges += 1
          return []
        },
        getMembershipEpoch: () => 1,
        getVersionVector: () => ({}),
      },
    })
    handles.push(first, second)
    const firstPeerId = first.status().peerId
    if (firstPeerId === null)
      throw new Error('First peer did not start')

    await waitFor(() => second.status().discoveredPeers.some(peer => peer.peerId === firstPeerId), 2_000)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(requestedChanges).toBe(0)
    expect(appliedChanges).toBe(0)
    expect(first.status().connectedPeers).toEqual([])
    expect(second.status().connectedPeers).toEqual([])
    expect(firstPairing.list()).toEqual([])
    expect(secondPairing.list()).toEqual([])
  })

  it('actively reconnects a paired peer after the connection closes', async () => {
    const firstPairing = new PairingManager({ deviceId: 'first', deviceName: 'First', peerId: '' }, new MemoryPairingStore())
    const secondPairing = new PairingManager({ deviceId: 'second', deviceName: 'Second', peerId: '' }, new MemoryPairingStore())
    await firstPairing.load()
    await secondPairing.load()
    const first = await createP2pNode({
      identity: { deviceId: 'first', deviceName: 'First' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: firstPairing,
      reconnectIntervalMs: 20,
    })
    const second = await createP2pNode({
      identity: { deviceId: 'second', deviceName: 'Second' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: secondPairing,
      reconnectIntervalMs: 20,
    })
    handles.push(first, second)
    const firstPeerId = first.status().peerId
    const secondPeerId = second.status().peerId
    if (firstPeerId === null || secondPeerId === null)
      throw new Error('Peers did not start')
    firstPairing.identity.peerId = firstPeerId
    secondPairing.identity.peerId = secondPeerId
    const accepted = await secondPairing.acceptInvitation(firstPairing.createInvitation())
    await firstPairing.completeInvitation(accepted.response)

    const initiator = firstPeerId < secondPeerId ? first : second
    const responder = firstPeerId < secondPeerId ? second : first
    const responderPeerId = responder.status().peerId
    const responderAddress = responder.node.getMultiaddrs()[0]
    if (responderPeerId === null || responderAddress === undefined)
      throw new Error('Responder did not start')
    await initiator.node.dial(multiaddr(responderAddress.toString()))
    await waitFor(() => initiator.status().connectedPeers.includes(responderPeerId))
    await initiator.node.hangUp(responderPeerId as never)
    await waitFor(() => !initiator.status().connectedPeers.includes(responderPeerId))
    await waitFor(() => initiator.status().connectedPeers.includes(responderPeerId))
  })

  it('discovers a paired peer without a user-provided multiaddress', async () => {
    const firstPairing = new PairingManager({ deviceId: 'first', deviceName: 'First', peerId: '' }, new MemoryPairingStore())
    const secondPairing = new PairingManager({ deviceId: 'second', deviceName: 'Second', peerId: '' }, new MemoryPairingStore())
    await firstPairing.load()
    await secondPairing.load()
    const received: string[] = []
    const firstProvider = {
      applyChanges: async () => undefined,
      getChanges: async (since: VersionVector) => since.first === 1 ? [] : [{ deviceId: 'first', id: 'mdns-change', kind: 'learning-mutation' as const, payload: '{}', sequence: 1 }],
      getMembershipEpoch: () => 1,
      getVersionVector: () => ({ first: 1 }),
    }
    const secondProvider = {
      applyChanges: async (changes: readonly { id: string }[]) => {
        received.push(...changes.map(change => change.id))
      },
      getChanges: async () => [],
      getMembershipEpoch: () => 1,
      getVersionVector: () => ({ first: received.length > 0 ? 1 : 0 }),
    }
    const first = await createP2pNode({
      identity: { deviceId: 'first', deviceName: 'First' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: firstPairing,
      provider: firstProvider,
      reconnectIntervalMs: 25,
    })
    const second = await createP2pNode({
      identity: { deviceId: 'second', deviceName: 'Second' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: secondPairing,
      provider: secondProvider,
      reconnectIntervalMs: 25,
    })
    handles.push(first, second)
    const firstPeerId = first.status().peerId
    const secondPeerId = second.status().peerId
    if (firstPeerId === null || secondPeerId === null)
      throw new Error('Peers did not start')
    firstPairing.identity.peerId = firstPeerId
    secondPairing.identity.peerId = secondPeerId
    const accepted = await secondPairing.acceptInvitation(firstPairing.createInvitation())
    await firstPairing.completeInvitation(accepted.response)

    await waitFor(() => first.status().connectedPeers.includes(secondPeerId), 2_000)
    await waitFor(() => received.includes('mdns-change'), 2_000)
  })

  it('forwards a durable change through a paired middle device', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-p2p-forward-'))
    temporaryDirectories.push(directory)
    const devices = ['first', 'middle', 'last'] as const
    const pairings = new Map(devices.map(deviceId => [
      deviceId,
      new PairingManager({ deviceId, deviceName: deviceId, peerId: '' }, new MemoryPairingStore()),
    ] as const))
    const journals = new Map<string, JsonSyncJournal>()
    for (const deviceId of devices) {
      await pairings.get(deviceId)?.load()
      const journal = new JsonSyncJournal(join(directory, `${deviceId}.json`))
      await journal.load()
      await journal.setDeviceId(deviceId)
      journals.set(deviceId, journal)
    }
    const createProvider = (deviceId: string) => {
      const journal = journals.get(deviceId)
      if (!journal)
        throw new Error(`Missing journal for ${deviceId}`)
      return {
        applyChanges: async (changes: readonly SyncChange[]) => journal.recordReceived(changes),
        getChanges: async (since: VersionVector) => journal.listChanges(since),
        getMembershipEpoch: () => 1,
        getVersionVector: () => journal.getVersionVector(),
      }
    }
    const first = await createP2pNode({
      identity: { deviceId: 'first', deviceName: 'first' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: pairings.get('first')!,
      provider: createProvider('first'),
    })
    const middle = await createP2pNode({
      identity: { deviceId: 'middle', deviceName: 'middle' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: pairings.get('middle')!,
      provider: createProvider('middle'),
    })
    const last = await createP2pNode({
      identity: { deviceId: 'last', deviceName: 'last' },
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: pairings.get('last')!,
      provider: createProvider('last'),
    })
    handles.push(first, middle, last)
    for (const [deviceId, handle] of [['first', first], ['middle', middle], ['last', last]] as const) {
      const peerId = handle.status().peerId
      if (peerId === null)
        throw new Error(`Peer ${deviceId} did not start`)
      pairings.get(deviceId)!.identity.peerId = peerId
    }
    const middlePairing = pairings.get('middle')!
    const lastPairing = pairings.get('last')!
    const firstPairing = pairings.get('first')!
    const middleInvitation = middlePairing.createInvitation()
    const acceptedLast = await lastPairing.acceptInvitation(middleInvitation)
    await middlePairing.completeInvitation(acceptedLast.response)
    const acceptedMiddle = await middlePairing.acceptInvitation(firstPairing.createInvitation())
    await firstPairing.completeInvitation(acceptedMiddle.response)

    await journals.get('first')!.appendLocal({ id: 'relayed-change', kind: 'learning-mutation', payload: '{}' })
    const middleAddress = middle.node.getMultiaddrs()[0]
    const lastAddress = last.node.getMultiaddrs()[0]
    const middlePeerId = middle.status().peerId
    const lastPeerId = last.status().peerId
    if (middleAddress === undefined || lastAddress === undefined || middlePeerId === null || lastPeerId === null)
      throw new Error('Relay peers did not expose listen addresses')
    await first.node.dial(multiaddr(middleAddress.toString()))
    await first.syncPeer(middlePeerId)
    await waitFor(() => journals.get('middle')!.getVersionVector().first === 1)
    await middle.node.dial(multiaddr(lastAddress.toString()))
    await middle.syncPeer(lastPeerId)
    await waitFor(() => journals.get('last')!.getVersionVector().first === 1)
    expect(journals.get('last')!.listChanges({}).some(change => change.id === 'relayed-change')).toBe(true)
  })
})
