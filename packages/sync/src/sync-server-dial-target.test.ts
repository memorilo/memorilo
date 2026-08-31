import { describe, expect, it } from 'vitest'
import { syncServerDialTarget } from './node'

describe('sync server dial target', () => {
  it.each([
    ['ws://127.0.0.1:6000', '/ip4/127.0.0.1/tcp/6000/ws'],
    ['ws://[::1]:6000', '/ip6/::1/tcp/6000/ws'],
    ['wss://sync.example.test', '/dns/sync.example.test/tcp/443/tls/ws'],
  ])('maps %s to a libp2p WebSocket multiaddr', (url, expected) => {
    expect(String(syncServerDialTarget(url))).toBe(expected)
  })

  it.each([
    'https://sync.example.test',
    'wss://user:secret@sync.example.test',
    'wss://sync.example.test/memorilo',
    'wss://sync.example.test?tenant=one',
  ])('rejects a non-origin server URL: %s', (url) => {
    expect(() => syncServerDialTarget(url)).toThrow()
  })
})
