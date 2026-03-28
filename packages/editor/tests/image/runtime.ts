import type {
  Asset,
  AssetAnalysisResult,
  AssetDeleteResult,
  AssetsHandlers,
} from '@memorilo/api-spec/services/assets'
import { setManagedRuntime } from '@memorilo/api-spec'
import { AssetsService } from '@memorilo/api-spec/services/assets'
import { Effect, Layer, ManagedRuntime } from 'effect'

export type ImageFixtureCall
  = | { kind: 'addAsset', sourcePath: string, meta: string | null }
    | { kind: 'addAssetFromBytes', bytes: number[], extension: string | null, meta: string | null }
    | { kind: 'addAssetFromBase64', base64: string, extension: string | null, meta: string | null }
    | { kind: 'addAssetFromUrl', url: string }
    | { kind: 'getAssetUrl', assetId: string, useHttps: boolean | null }

const calls: ImageFixtureCall[] = []
const assetUrls = new Map<string, string>()
let nextAssetId = 1

const emptyAnalysisResult: AssetAnalysisResult = {
  missingFiles: [],
  untrackedFiles: [],
  unusedFiles: [],
}

const emptyDeleteResult: AssetDeleteResult = {
  deletedRecord: false,
  deletedFiles: [],
}

function cloneCall(call: ImageFixtureCall): ImageFixtureCall {
  if (call.kind === 'addAssetFromBytes') {
    return {
      ...call,
      bytes: [...call.bytes],
    }
  }

  return { ...call }
}

function recordCall(call: ImageFixtureCall) {
  calls.push(cloneCall(call))
}

function getPathExtension(value: string): string | null {
  const cleanValue = value.split(/[?#]/, 1)[0] ?? value
  const lastSegment = cleanValue.split('/').pop()
  if (!lastSegment || !lastSegment.includes('.')) {
    return null
  }

  const extension = lastSegment.split('.').pop()
  if (!extension) {
    return null
  }

  return extension.toLowerCase()
}

function createAssetRecord(extension: string | null, meta: string | null): Asset {
  const assetId = `asset-${nextAssetId}`
  nextAssetId += 1

  const filename = extension
    ? `${assetId}.${extension}`
    : assetId
  const url = `mock://assets/${filename}`

  assetUrls.set(assetId, url)

  return {
    assetId,
    filename,
    sha256: `sha256-${assetId}`,
    clientId: 'fixture-client',
    createdAt: '2026-03-23T00:00:00.000Z',
    meta,
  }
}

function getAssetUrlOrThrow(assetId: string) {
  const url = assetUrls.get(assetId)
  if (!url) {
    throw new Error(`Missing mock asset URL for ${assetId}`)
  }

  return url
}

const assetsHandlers: AssetsHandlers = {
  addAsset: (sourcePath, meta) =>
    Effect.sync(() => {
      recordCall({
        kind: 'addAsset',
        sourcePath,
        meta,
      })

      return createAssetRecord(getPathExtension(sourcePath), meta)
    }),

  addAssetFromBytes: (bytes, extension, meta) =>
    Effect.sync(() => {
      recordCall({
        kind: 'addAssetFromBytes',
        bytes: [...bytes],
        extension,
        meta,
      })

      return createAssetRecord(extension, meta)
    }),

  addAssetFromBase64: (base64, extension, meta) =>
    Effect.sync(() => {
      recordCall({
        kind: 'addAssetFromBase64',
        base64,
        extension,
        meta,
      })

      return createAssetRecord(extension, meta)
    }),

  addAssetFromUrl: url =>
    Effect.sync(() => {
      recordCall({
        kind: 'addAssetFromUrl',
        url,
      })

      return createAssetRecord(getPathExtension(url), null)
    }),

  getAssetUrl: (assetId, useHttps) =>
    Effect.sync(() => {
      recordCall({
        kind: 'getAssetUrl',
        assetId,
        useHttps,
      })

      return getAssetUrlOrThrow(assetId)
    }),

  deleteAsset: () => Effect.succeed(emptyDeleteResult),
  analyzeAssets: () => Effect.succeed(emptyAnalysisResult),
}

const runtime = ManagedRuntime.make(
  Layer.succeed(AssetsService, assetsHandlers),
)

setManagedRuntime(runtime)

export function resetImageFixtureRuntime() {
  calls.length = 0
  assetUrls.clear()
  nextAssetId = 1
}

export function clearImageFixtureCalls() {
  calls.length = 0
}

export function getImageFixtureCalls() {
  return calls.map(cloneCall)
}

export function seedImageFixtureAsset(assetId: string, extension: string | null) {
  const filename = extension
    ? `${assetId}.${extension}`
    : assetId

  assetUrls.set(assetId, `mock://assets/${filename}`)
}
