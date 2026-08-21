import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { decodePairingPayload, MemoryPairingStore, PairingManager } from './pairing'

describe('pairing', () => {
  it('completes a two-device invitation exchange and persists both sides', async () => {
    const now = () => 1_000
    const first = new PairingManager({ deviceId: 'first', deviceName: 'First', membershipEpoch: 4, peerId: 'peer-first' }, new MemoryPairingStore(), now)
    const second = new PairingManager({ deviceId: 'second', deviceName: 'Second', peerId: 'peer-second' }, new MemoryPairingStore(), now)
    await first.load()
    await second.load()

    const invitation = first.createInvitation()
    expect(decodePairingPayload(invitation).membershipEpoch).toBe(4)
    const accepted = await second.acceptInvitation(invitation)
    const completed = await first.completeInvitation(accepted.response)

    expect(accepted.device.peerId).toBe('peer-first')
    expect(completed.deviceId).toBe('second')
    expect(first.findByPeerId('peer-second')).toMatchObject({ deviceId: 'second', pairingId: accepted.device.pairingId })
    expect(second.findByPeerId('peer-first')).toMatchObject({ deviceId: 'first', pairingId: accepted.device.pairingId })
    expect(decodePairingPayload(accepted.response).membershipEpoch).toBe(4)
  })

  it('rejects expired and malformed invitations', async () => {
    let current = 1_000
    const manager = new PairingManager({ deviceId: 'device', deviceName: 'Device', peerId: 'peer' }, new MemoryPairingStore(), () => current)
    await manager.load()
    const invitation = manager.createInvitation(10)
    current = 1_011
    await expect(manager.acceptInvitation(invitation)).rejects.toThrow('expired')
    await expect(manager.acceptInvitation('not-a-pairing-code')).rejects.toThrow()
    const malformed = `memorilo-pair-v1.${Buffer.from(JSON.stringify({ version: 1, expiresAt: 2_000 }), 'utf8').toString('base64url')}`
    await expect(manager.acceptInvitation(malformed)).rejects.toThrow('incomplete')
  })
})
