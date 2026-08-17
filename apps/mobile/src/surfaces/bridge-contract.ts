export const mobileSurfaceBridgeVersion = 1 as const

export type MobileSurfaceKind = 'card' | 'editor' | 'reader'

export interface SurfaceReadyMessage {
  surface: MobileSurfaceKind
  type: 'surface.ready'
  version: typeof mobileSurfaceBridgeVersion
}

export interface SurfaceErrorMessage {
  error: string
  surface: MobileSurfaceKind
  type: 'surface.error'
  version: typeof mobileSurfaceBridgeVersion
}

export type SurfaceToHostMessage = SurfaceErrorMessage | SurfaceReadyMessage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSurfaceKind(value: unknown): value is MobileSurfaceKind {
  return value === 'card' || value === 'editor' || value === 'reader'
}

export function parseSurfaceToHostMessage(serialized: string): SurfaceToHostMessage {
  const parsed: unknown = JSON.parse(serialized)
  if (!isRecord(parsed))
    throw new TypeError('WebView bridge message must be an object')
  if (parsed.version !== mobileSurfaceBridgeVersion)
    throw new Error(`Unsupported WebView bridge version ${String(parsed.version)}`)
  if (!isSurfaceKind(parsed.surface))
    throw new TypeError('WebView bridge message contains an invalid surface')
  if (parsed.type === 'surface.ready') {
    return {
      surface: parsed.surface,
      type: parsed.type,
      version: mobileSurfaceBridgeVersion,
    }
  }
  if (parsed.type === 'surface.error') {
    if (typeof parsed.error !== 'string' || parsed.error.trim().length === 0)
      throw new TypeError('WebView surface error must contain a message')
    return {
      error: parsed.error,
      surface: parsed.surface,
      type: parsed.type,
      version: mobileSurfaceBridgeVersion,
    }
  }
  throw new Error(`Unknown WebView bridge message type ${String(parsed.type)}`)
}
