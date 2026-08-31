import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Duration, Effect, Schedule } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { createP2pApplication } from './node'

const applications: Array<{ close: () => Promise<void> }> = []
const temporaryDirectories: string[] = []

afterEach(async () => {
  await Effect.runPromise(Effect.all([
    ...applications.splice(0).map(application => Effect.promise(() => application.close())),
    ...temporaryDirectories.splice(0).map(directory => Effect.promise(() => rm(directory, { force: true, recursive: true }))),
  ], { concurrency: 'unbounded' }))
})

describe('p2p application pairing', () => {
  const emptyProvider = {
    applyChanges: async () => undefined,
    getChanges: async () => [],
    getMembershipEpoch: () => 1,
    getVersionVector: () => ({}),
  }

  async function waitFor<Result>(read: () => Result | undefined, timeoutMs = 2_000): Promise<Result> {
    return Effect.runPromise(Effect.sync(read).pipe(
      Effect.flatMap(result => result === undefined
        ? Effect.fail(new Error('Pairing state is not ready'))
        : Effect.succeed(result)),
      Effect.retry(Schedule.spaced(Duration.millis(10))),
      Effect.timeoutOrElse({
        duration: Duration.millis(timeoutMs),
        onTimeout: () => Effect.fail(new Error(`Timed out waiting ${timeoutMs}ms for pairing state`)),
      }),
    ))
  }

  it('pairs only after a five-minute availability response, approval, matching five emoji and confirmation on both devices', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-p2p-discovery-'))
    temporaryDirectories.push(directory)
    const first = await createP2pApplication({ deviceName: 'First', provider: emptyProvider, statePath: join(directory, 'first', 'identity.json') })
    const second = await createP2pApplication({ deviceName: 'Second', provider: emptyProvider, statePath: join(directory, 'second', 'identity.json') })
    applications.push(first, second)

    const firstPeerId = first.status().peerId
    if (firstPeerId === null)
      throw new Error('First device did not start')
    await Effect.runPromise(Effect.sleep(Duration.millis(100)))
    expect(second.discoveredPeers().some(peer => peer.peerId === firstPeerId)).toBe(false)
    await expect(second.requestPairing(firstPeerId)).rejects.toThrow('not available')

    await first.enableDiscovery()
    const available = await waitFor(() => second.discoveredPeers().find(peer => peer.peerId === firstPeerId))
    expect(available).toMatchObject({ deviceId: first.pairing.identity.deviceId, deviceName: 'First' })
    await second.requestPairing(firstPeerId)
    const incoming = await waitFor(() => first.listPairingRequests()[0])
    expect(incoming.deviceName).toBe('Second')
    expect(first.pairing.list()).toEqual([])
    expect(second.pairing.list()).toEqual([])

    const firstEmoji = await first.approvePairing(incoming.requestId)
    const outgoing = await waitFor(() => second.listPairingRequests().find(request => request.requestId === incoming.requestId && request.emoji.length > 0))
    expect([...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(firstEmoji)]).toHaveLength(5)
    expect(outgoing.emoji).toBe(firstEmoji)
    expect(outgoing.deviceName).toBe('First')

    await expect(first.confirmPairing(incoming.requestId, 'wrong')).rejects.toThrow('does not match')
    await expect(first.confirmPairing(incoming.requestId, firstEmoji)).resolves.toBeNull()
    await Effect.runPromise(Effect.sleep(Duration.millis(100)))
    expect(first.pairing.list()).toEqual([])
    expect(second.pairing.list()).toEqual([])
    await expect(second.confirmPairing(incoming.requestId, outgoing.emoji)).resolves.toMatchObject({ deviceId: first.pairing.identity.deviceId })
    await waitFor(() => first.pairing.list()[0])
    expect(first.pairing.list()[0]).toMatchObject({ deviceId: second.pairing.identity.deviceId, deviceName: 'Second' })
    expect(second.pairing.list()[0]).toMatchObject({ deviceId: first.pairing.identity.deviceId, deviceName: 'First' })

    const grantBeforeRename = second.pairing.list()[0]!
    const epochBeforeRename = first.membershipEpoch()
    await first.updateDeviceName('Renamed First')
    await waitFor(() => second.pairing.list().find(device => device.deviceName === 'Renamed First'))
    expect(second.pairing.list()[0]).toMatchObject({
      deviceId: grantBeforeRename.deviceId,
      pairingId: grantBeforeRename.pairingId,
      peerId: grantBeforeRename.peerId,
      sharedSecret: grantBeforeRename.sharedSecret,
    })
    expect(first.membershipEpoch()).toBe(epochBeforeRename)
  })

  it('persists a changed local device name without rotating identity, keys or membership', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-p2p-device-name-'))
    temporaryDirectories.push(directory)
    const statePath = join(directory, 'identity.json')
    const application = await createP2pApplication({ deviceName: 'host-name', statePath })
    applications.push(application)
    const before = JSON.parse(await readFile(statePath, 'utf8')) as {
      deviceId: string
      deviceName: string
      membershipEpoch: number
      privateKey: string
    }

    expect(application.localDevice()).toMatchObject({ deviceId: before.deviceId, deviceName: 'host-name' })
    await application.updateDeviceName('Study Mac')
    const after = JSON.parse(await readFile(statePath, 'utf8')) as typeof before

    expect(application.localDevice()).toMatchObject({ deviceId: before.deviceId, deviceName: 'Study Mac' })
    expect(after).toEqual({ ...before, deviceName: 'Study Mac' })
    expect(application.membershipEpoch()).toBe(before.membershipEpoch)

    await application.close()
    applications.splice(applications.indexOf(application), 1)
    const reopened = await createP2pApplication({ deviceName: 'different-host', statePath })
    applications.push(reopened)
    expect(reopened.localDevice()).toMatchObject({ deviceId: before.deviceId, deviceName: 'Study Mac' })
  })

  it('expires advertised availability after five minutes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-p2p-availability-'))
    temporaryDirectories.push(directory)
    let now = 10_000
    const first = await createP2pApplication({ deviceName: 'First', now: () => now, statePath: join(directory, 'first', 'identity.json') })
    const second = await createP2pApplication({ deviceName: 'Second', now: () => now, statePath: join(directory, 'second', 'identity.json') })
    applications.push(first, second)

    const firstPeerId = first.status().peerId
    if (firstPeerId === null)
      throw new Error('First device did not start')
    const expiresAt = await first.enableDiscovery()
    expect(expiresAt).toBe(now + 5 * 60 * 1000)
    await waitFor(() => second.discoveredPeers().find(peer => peer.peerId === firstPeerId))

    now = expiresAt + 1
    expect(first.discoveryEnabled()).toBe(false)
    expect(second.discoveredPeers().some(peer => peer.peerId === firstPeerId)).toBe(false)
    await expect(second.requestPairing(firstPeerId)).rejects.toThrow('not available')
  })

  it('does not restore discovery or pending pairing requests after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-p2p-pairing-restart-'))
    temporaryDirectories.push(directory)
    const firstStatePath = join(directory, 'first', 'identity.json')
    const first = await createP2pApplication({ deviceName: 'First', statePath: firstStatePath })
    const second = await createP2pApplication({ deviceName: 'Second', statePath: join(directory, 'second', 'identity.json') })
    applications.push(first, second)

    const firstPeerId = first.status().peerId
    if (firstPeerId === null)
      throw new Error('First device did not start')
    await first.enableDiscovery()
    await waitFor(() => second.discoveredPeers().find(peer => peer.peerId === firstPeerId))
    await second.requestPairing(firstPeerId)
    await waitFor(() => first.listPairingRequests()[0])

    await first.close()
    applications.splice(applications.indexOf(first), 1)
    const reopened = await createP2pApplication({ deviceName: 'First', statePath: firstStatePath })
    applications.push(reopened)
    expect(reopened.discoveryEnabled()).toBe(false)
    expect(reopened.listPairingRequests()).toEqual([])
  })

  it('persists membership epochs and does not advance them for duplicate grants', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-p2p-application-'))
    temporaryDirectories.push(directory)
    const first = await createP2pApplication({
      deviceName: 'First',
      statePath: join(directory, 'first', 'identity.json'),
    })
    const second = await createP2pApplication({
      deviceName: 'Second',
      statePath: join(directory, 'second', 'identity.json'),
    })
    applications.push(first, second)

    const invitation = await first.createInvitation()
    const response = await second.acceptInvitation(invitation)
    await first.completePairing(response)
    expect(first.membershipEpoch()).toBe(2)
    expect(second.membershipEpoch()).toBe(2)

    await second.acceptInvitation(invitation)
    await first.completePairing(response)
    expect(first.membershipEpoch()).toBe(2)
    expect(second.membershipEpoch()).toBe(2)

    await first.close()
    applications.splice(applications.indexOf(first), 1)
    const reopened = await createP2pApplication({
      deviceName: 'First',
      statePath: join(directory, 'first', 'identity.json'),
    })
    applications.push(reopened)
    expect(reopened.membershipEpoch()).toBe(2)
    const pairedDevice = reopened.pairing.list()[0]
    if (!pairedDevice)
      throw new Error('Expected the persisted paired device')
    await reopened.removeDevice(pairedDevice.deviceId)
    expect(reopened.membershipEpoch()).toBe(3)
    await reopened.removeDevice(pairedDevice.deviceId)
    expect(reopened.membershipEpoch()).toBe(3)
  })

  it('persists pending invitations and rejects responses for another grant', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-p2p-pending-'))
    temporaryDirectories.push(directory)
    const firstStatePath = join(directory, 'first', 'identity.json')
    const secondStatePath = join(directory, 'second', 'identity.json')
    const first = await createP2pApplication({ deviceName: 'First', statePath: firstStatePath })
    const second = await createP2pApplication({ deviceName: 'Second', statePath: secondStatePath })
    applications.push(first, second)

    const invitation = await first.createInvitation()
    const unrelatedInvitation = await second.createInvitation()
    await first.close()
    applications.splice(applications.indexOf(first), 1)
    const reopened = await createP2pApplication({ deviceName: 'First', statePath: firstStatePath })
    applications.push(reopened)

    await expect(reopened.completePairing(unrelatedInvitation)).rejects.toThrow('does not match')
    const response = await second.acceptInvitation(invitation)
    await expect(reopened.completePairing(response)).resolves.toMatchObject({ deviceId: second.pairing.identity.deviceId })
  })
})
