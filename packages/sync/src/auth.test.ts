import { describe, expect, it } from 'vitest'
import { decodeSyncServerCredentialBundle, encodeSyncServerCredentialBundle } from './auth'

describe('sync server credential bundle', () => {
  it('round-trips a versioned server credential without Node-only codecs', () => {
    const bundle = {
      credential: 'credential-value-long-enough',
      generation: 2,
      membershipEpoch: 3,
      modes: ['relay', 'authoritative'] as const,
      peerId: 'server-peer',
      policyEpoch: 4,
      version: 1 as const,
    }

    expect(decodeSyncServerCredentialBundle(encodeSyncServerCredentialBundle(bundle))).toEqual(bundle)
  })

  it('rejects legacy raw credentials and unknown fields', () => {
    expect(() => decodeSyncServerCredentialBundle('legacy-raw-credential')).toThrow('Unsupported')
    const bundleWithExtraField = {
      credential: 'credential-value-long-enough',
      extra: true,
      generation: 0,
      membershipEpoch: 1,
      modes: ['relay'] as const,
      peerId: 'server-peer',
      policyEpoch: 0,
      version: 1 as const,
    }
    expect(() => decodeSyncServerCredentialBundle(encodeSyncServerCredentialBundle(bundleWithExtraField))).toThrow('Invalid')
  })
})
