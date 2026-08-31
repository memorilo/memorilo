import { describe, expect, it } from 'vitest'
import {
  compareVersionVectors,
  decodeAssetManifest,
  decodeMessage,
  encodeMessage,
  maxSyncFrameBytes,
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
      frontiers: { assets: {}, learning: {}, notes: { phone: 2 } },
      generation: 0,
      issuedAt: 1,
      membershipEpoch: 4,
      modes: ['direct'] as const,
      namespaces: ['notes', 'learning'] as const,
      nonce: 'session-nonce',
      pairingId: 'pairing',
      policyEpoch: 0,
      protocol: 'memorilo-sync/1' as const,
      role: 'device' as const,
      sharedSecret: 'secret',
      signature: 'signature',
      type: 'hello' as const,
    }
    expect(decodeMessage(encodeMessage(message))).toEqual(message)
    expect(() => decodeMessage(new TextEncoder().encode('{"type":"unknown"}\n'))).toThrow()
  })

  it('rejects truncated, malformed, and oversized frames before decoding messages', () => {
    const payload = new TextEncoder().encode('{"type":"error","code":"server-failure","action":"retry","retryable":true}')
    const frame = new Uint8Array(payload.byteLength + 4)
    new DataView(frame.buffer).setUint32(0, payload.byteLength)
    frame.set(payload, 4)

    expect(() => decodeMessage(frame.slice(0, -1))).toThrow('Invalid Memorilo sync message')

    const mismatched = frame.slice()
    new DataView(mismatched.buffer).setUint32(0, payload.byteLength - 1)
    expect(() => decodeMessage(mismatched)).toThrow('Invalid Memorilo sync message')

    const oversized = new Uint8Array(4)
    new DataView(oversized.buffer).setUint32(0, maxSyncFrameBytes + 1)
    expect(() => decodeMessage(oversized)).toThrow('Invalid Memorilo sync message')

    const malformedPayload = new TextEncoder().encode('{not-json}')
    const malformed = new Uint8Array(malformedPayload.byteLength + 4)
    new DataView(malformed.buffer).setUint32(0, malformedPayload.byteLength)
    malformed.set(malformedPayload, 4)
    expect(() => decodeMessage(malformed)).toThrow('Invalid Memorilo sync message')
  })

  it('strictly decodes asset manifests with original file metadata', () => {
    const manifest = {
      contentHash: 'a'.repeat(64),
      contentLength: 12,
      contentType: 'image/png',
      createdAt: 1,
      deviceId: 'phone',
      fileName: '00000000-0000-0000-0000-000000000001.png',
      id: 'phone:asset:1',
      operation: 'put' as const,
      originalFileName: 'photo.png',
      sequence: 1,
    }
    expect(decodeAssetManifest(manifest)).toEqual(manifest)
    expect(() => decodeAssetManifest({ ...manifest, extra: true })).toThrow()
    const { originalFileName: _, ...missingOriginalName } = manifest
    expect(() => decodeAssetManifest(missingOriginalName)).toThrow()
  })
})
