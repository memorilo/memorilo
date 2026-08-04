import * as Schema from 'effect/Schema'
import { describe, expect, it } from 'vitest'
import {
  desktopConfigurationDefinition,
  DesktopConfigurationSchema,
  migrateDesktopConfiguration,
} from './index'

const decode = Schema.decodeUnknownSync(DesktopConfigurationSchema)
const token = '0123456789abcdef0123456789abcdef'

function configuration(mcp: { accessToken: string, enabled: boolean, port: number }) {
  return {
    language: 'system',
    mcp,
    networkImagePasteBehavior: 'download',
    outdentBehavior: 'logical',
    readerArrowKeyPageTurning: true,
    readerEpubPresentationMode: 'publisher',
    reduceMotion: false,
    tiffConversionFormat: 'webp',
  }
}

describe('desktop MCP configuration', () => {
  it('is disabled by default on the loopback MCP port', () => {
    expect(desktopConfigurationDefinition.defaults.mcp).toEqual({
      accessToken: '',
      enabled: false,
      port: 8765,
    })
  })

  it('requires a strong token only when enabled and validates the port range', () => {
    expect(decode(configuration({ accessToken: '', enabled: false, port: 8765 }))).toEqual(configuration({ accessToken: '', enabled: false, port: 8765 }))
    expect(() => decode(configuration({ accessToken: 'short', enabled: true, port: 8765 }))).toThrow('at least 32 characters')
    expect(decode(configuration({ accessToken: token, enabled: true, port: 1024 })).mcp.port).toBe(1024)
    expect(decode(configuration({ accessToken: token, enabled: true, port: 65535 })).mcp.port).toBe(65535)
    expect(() => decode(configuration({ accessToken: token, enabled: true, port: 1023 }))).toThrow()
    expect(() => decode(configuration({ accessToken: token, enabled: true, port: 65536 }))).toThrow()
    expect(() => decode(configuration({ accessToken: token, enabled: true, port: 8765.5 }))).toThrow()
  })

  it('migrates legacy, partial, and unsafe configurations without enabling MCP', () => {
    expect(migrateDesktopConfiguration({ language: 'en', reduceMotion: true })).toEqual({
      language: 'en',
      mcp: { accessToken: '', enabled: false, port: 8765 },
      outdentBehavior: 'logical',
      readerArrowKeyPageTurning: true,
      readerEpubPresentationMode: 'publisher',
      reduceMotion: true,
    })
    expect(migrateDesktopConfiguration({
      language: 'en',
      mcp: { accessToken: token },
      outdentBehavior: 'traditional',
      reduceMotion: true,
    })).toEqual({
      language: 'en',
      mcp: { accessToken: token, enabled: false, port: 8765 },
      outdentBehavior: 'traditional',
      readerArrowKeyPageTurning: true,
      readerEpubPresentationMode: 'publisher',
      reduceMotion: true,
    })
    expect(migrateDesktopConfiguration(configuration({ accessToken: 'short', enabled: true, port: 80 }))).toEqual(
      configuration({ accessToken: 'short', enabled: false, port: 8765 }),
    )
  })

  it('is idempotent for complete configurations', () => {
    const current = configuration({ accessToken: token, enabled: true, port: 9000 })
    expect(migrateDesktopConfiguration(current)).toBe(current)
    expect(migrateDesktopConfiguration(migrateDesktopConfiguration(current))).toEqual(current)
  })
})
