import type {
  ClipboardImageSource,
  PersistedImageAttributes,
} from './types'
import { AssetsService } from '@memorilo/api-spec/services/assets'
import { Effect } from 'effect'
import { extension as getMimeExtension } from 'mime-types'

function toError(cause: unknown) {
  if (cause instanceof Error) {
    return cause
  }

  return new Error(String(cause))
}

function getDataUrlMimeType(dataUrl: string) {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl)
  if (!match) {
    return null
  }

  const mimeType = match[1]
  if (mimeType === undefined) {
    return null
  }

  return mimeType.toLowerCase()
}

function getExtensionFromMimeType(mimeType: string | null) {
  if (mimeType === null || mimeType.trim().length === 0) {
    return null
  }

  const extension = getMimeExtension(mimeType)
  if (typeof extension !== 'string' || extension.length === 0) {
    return null
  }

  return extension.toLowerCase()
}

function getExtensionFromFileName(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex < 0 || lastDotIndex === fileName.length - 1) {
    return null
  }

  return fileName.slice(lastDotIndex + 1).toLowerCase()
}

function getClipboardFileExtension(file: File) {
  const mimeExtension = getExtensionFromMimeType(file.type)
  if (mimeExtension) {
    return mimeExtension
  }

  return getExtensionFromFileName(file.name)
}

function buildPersistedImageAttributes(source: ClipboardImageSource, assetId: string, src: string): PersistedImageAttributes {
  return {
    ...source,
    assetId,
    src,
  }
}

function readBytes(readArrayBuffer: () => Promise<ArrayBuffer>) {
  return Effect.tryPromise({
    try: async () => {
      const buffer = await readArrayBuffer()
      return Array.from(new Uint8Array(buffer))
    },
    catch: toError,
  })
}

export function persistClipboardImageSource(source: ClipboardImageSource) {
  return Effect.gen(function* () {
    if (source.kind === 'existing-asset') {
      return buildPersistedImageAttributes(source, source.assetId, source.src)
    }

    const assetsService = yield* AssetsService

    if (source.kind === 'remote-url') {
      const asset = yield* assetsService.addAssetFromUrl(source.url)
      const src = yield* assetsService.getAssetUrl(asset.assetId, null)
      return buildPersistedImageAttributes(source, asset.assetId, src)
    }

    if (source.kind === 'data-url') {
      const mimeType = getDataUrlMimeType(source.dataUrl)
      const asset = yield* assetsService.addAssetFromBase64(
        source.dataUrl,
        getExtensionFromMimeType(mimeType),
        JSON.stringify({
          source: 'data-url',
          mimeType,
        }),
      )
      const src = yield* assetsService.getAssetUrl(asset.assetId, null)
      return buildPersistedImageAttributes(source, asset.assetId, src)
    }

    if (source.kind === 'file-path') {
      const asset = yield* assetsService.addAsset(
        source.path,
        JSON.stringify({
          source: 'file-url',
          url: source.url,
        }),
      )
      const src = yield* assetsService.getAssetUrl(asset.assetId, null)
      return buildPersistedImageAttributes(source, asset.assetId, src)
    }

    if (source.kind === 'blob-url') {
      const response = yield* Effect.tryPromise({
        try: () => fetch(source.url),
        catch: toError,
      })
      if (!response.ok) {
        throw new Error(`Failed to read blob image: HTTP ${response.status}`)
      }

      const bytes = yield* readBytes(() => response.arrayBuffer())
      const mimeType = response.headers.get('Content-Type')
      const asset = yield* assetsService.addAssetFromBytes(
        bytes,
        getExtensionFromMimeType(mimeType),
        JSON.stringify({
          source: 'blob-url',
          url: source.url,
          mimeType,
        }),
      )
      const src = yield* assetsService.getAssetUrl(asset.assetId, null)
      return buildPersistedImageAttributes(source, asset.assetId, src)
    }

    const bytes = yield* readBytes(() => source.file.arrayBuffer())
    const asset = yield* assetsService.addAssetFromBytes(
      bytes,
      getClipboardFileExtension(source.file),
      JSON.stringify({
        source: 'clipboard-file',
        mimeType: source.file.type || null,
        name: source.file.name || null,
      }),
    )
    const src = yield* assetsService.getAssetUrl(asset.assetId, null)
    return buildPersistedImageAttributes(source, asset.assetId, src)
  })
}
