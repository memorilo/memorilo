import { describe, expect, it } from 'vitest'
import {
  compareVersionVectors,
  decodeMessage,
  encodeMessage,
  mergeVersionVectors,
  missingSequences,
} from './model'

describe('version vectors', () => {
  it('merges device counters and reports missing counters', () => {
    expect(mergeVersionVectors({ phone: 2 }, { laptop: 3, phone: 1 })).toEqual({ laptop: 3, phone: 2 })
    expect(missingSequences({ phone: 1 }, { laptop: 3, phone: 2 })).toEqual({ laptop: 3, phone: 2 })
    expect(compareVersionVectors({ phone: 2 }, { phone: 1 })).toBe('left-dominates')
    expect(compareVersionVectors({ phone: 1 }, { laptop: 1 })).toBe('concurrent')
  })

  it('round trips framed sync messages', () => {
    const message = {
      deviceId: 'phone',
      deviceName: 'Phone',
      membershipEpoch: 4,
      pairingId: 'pairing',
      protocol: 'memorilo-sync/1' as const,
      sharedSecret: 'secret',
      type: 'hello' as const,
      versionVector: { phone: 2 },
    }
    expect(decodeMessage(encodeMessage(message))).toEqual(message)
    expect(() => decodeMessage(new TextEncoder().encode('{"type":"unknown"}\n'))).toThrow()
  })
})
