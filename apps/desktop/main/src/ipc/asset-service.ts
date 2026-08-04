import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration, DesktopTiffConversionFormat } from '@memorilo/desktop-config'
import type { EditorStorage } from '@memorilo/editor-storage'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { BrowserWindow, dialog, net, shell } from 'electron'
import { getIpcContext, IpcMethod, IpcService } from 'electron-ipc-decorator'
import sharp from 'sharp'

import { checkManagedAssets } from '../assets/asset-maintenance'
import { assetSource } from '../assets/asset-uri'

interface SaveImageInput {
  data: Uint8Array
  fileName: string
  mimeType: string
}

interface SaveImageResult {
  src: string
}

interface ImportNetworkImageInput {
  source: string
}

interface ReclaimAssetsInput {
  fileNames: readonly string[]
  mode: 'permanent' | 'trash'
}

interface ReclaimAssetsResult {
  cancelled: boolean
  failedFileNames: readonly string[]
  reclaimedFileNames: readonly string[]
}

const assetCheckSafetyWindow = 5 * 60 * 1000

const imageExtensionsByMimeType: Readonly<Record<string, string>> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
}

const maximumImageSize = 50 * 1024 * 1024
const tiffConversions: Readonly<Record<DesktopTiffConversionFormat, { extension: string, mimeType: string }>> = {
  avif: { extension: '.avif', mimeType: 'image/avif' },
  jpeg: { extension: '.jpg', mimeType: 'image/jpeg' },
  png: { extension: '.png', mimeType: 'image/png' },
  webp: { extension: '.webp', mimeType: 'image/webp' },
}
const mimeTypesByImageExtension = Object.fromEntries(
  Object.entries(imageExtensionsByMimeType).map(([mimeType, extension]) => [extension, mimeType]),
) as Readonly<Record<string, string>>
const supportedImageExtensions = new Set(Object.values(imageExtensionsByMimeType))

function startsWith(data: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => data[offset + index] === byte)
}

function detectedImageExtension(data: Uint8Array): string | null {
  if (startsWith(data, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
    return '.png'
  if (startsWith(data, [0xFF, 0xD8, 0xFF]))
    return '.jpg'
  if (startsWith(data, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(data, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))
    return '.gif'
  if (startsWith(data, [0x42, 0x4D]))
    return '.bmp'
  if (startsWith(data, [0x49, 0x49, 0x2A, 0x00]) || startsWith(data, [0x4D, 0x4D, 0x00, 0x2A]))
    return '.tiff'
  if (startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8))
    return '.webp'
  if (startsWith(data, [0x66, 0x74, 0x79, 0x70], 4)) {
    const brands = new TextDecoder('ascii').decode(data.slice(8, 32))
    if (brands.includes('avif') || brands.includes('avis'))
      return '.avif'
  }

  const prefix = new TextDecoder().decode(data.slice(0, 4096)).replace(/^\uFEFF/, '').trimStart()
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(prefix))
    return '.svg'
  return null
}

function imageExtension(input: SaveImageInput): string {
  const detected = detectedImageExtension(input.data)
  if (!detected)
    throw new TypeError('Image data has an unsupported format')

  const declared = imageExtensionsByMimeType[input.mimeType.toLowerCase()]
  const fileExtension = extname(input.fileName).toLowerCase()
  if (declared !== undefined && declared !== detected)
    throw new TypeError('Image data does not match its MIME type')
  if (declared === undefined && input.mimeType.length > 0)
    throw new TypeError(`Unsupported image type: ${input.mimeType}`)
  if (declared === undefined && supportedImageExtensions.has(fileExtension) && fileExtension !== detected)
    throw new TypeError('Image data does not match its file extension')
  return detected
}

async function readImageResponse(response: Response): Promise<Uint8Array> {
  if (!response.body)
    return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    byteLength += value.byteLength
    if (byteLength > maximumImageSize) {
      await reader.cancel()
      throw new TypeError('Image must not exceed 50 MiB')
    }
    chunks.push(value)
  }
  const image = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    image.set(chunk, offset)
    offset += chunk.byteLength
  }
  return image
}

async function convertTiff(
  data: Uint8Array,
  format: DesktopTiffConversionFormat,
): Promise<{ data: Uint8Array, extension: string, mimeType: string }> {
  const conversion = tiffConversions[format]
  let pipeline = sharp(data).autoOrient()
  switch (format) {
    case 'avif':
      pipeline = pipeline.avif()
      break
    case 'jpeg':
      pipeline = pipeline.jpeg()
      break
    case 'png':
      pipeline = pipeline.png()
      break
    case 'webp':
      pipeline = pipeline.webp()
      break
  }
  return { ...conversion, data: await pipeline.toBuffer() }
}

export function createAssetService(
  assetDirectory: string | null,
  storage: EditorStorage,
  configuration: ConfigurationStore<DesktopConfiguration>,
  serializeAssetOperation: <Result>(operation: () => Promise<Result>) => Promise<Result>,
) {
  const persistImage = async (input: SaveImageInput): Promise<SaveImageResult> => {
    if (assetDirectory === null)
      throw new Error('Images cannot be stored when using an in-memory database')
    if (typeof input !== 'object' || input === null)
      throw new TypeError('Image input is required')
    if (!(input.data instanceof Uint8Array) || input.data.byteLength === 0)
      throw new TypeError('Image data must not be empty')
    if (input.data.byteLength > maximumImageSize)
      throw new TypeError('Image must not exceed 50 MiB')
    if (typeof input.fileName !== 'string' || input.fileName.trim().length === 0)
      throw new TypeError('Image file name must not be empty')
    if (typeof input.mimeType !== 'string')
      throw new TypeError('Image MIME type must be a string')

    const detectedExtension = imageExtension(input)
    const stored = detectedExtension === '.tiff'
      ? await convertTiff(input.data, configuration.getSnapshot().tiffConversionFormat)
      : {
          data: input.data,
          extension: detectedExtension,
          mimeType: mimeTypesByImageExtension[detectedExtension],
        }
    if (!stored.mimeType)
      throw new TypeError(`Unsupported image extension: ${stored.extension}`)
    const fileName = `${randomUUID()}${stored.extension}`
    await mkdir(assetDirectory, { recursive: true })
    const filePath = join(assetDirectory, fileName)
    await writeFile(filePath, stored.data, { flag: 'wx' })
    try {
      await storage.registerAsset({
        byteSize: stored.data.byteLength,
        fileName,
        mimeType: stored.mimeType,
        originalFileName: input.fileName,
      })
    }
    catch (error) {
      await rm(filePath, { force: true })
      throw error
    }
    return { src: assetSource(fileName) }
  }

  class AssetService extends IpcService {
    static override readonly groupName = 'assets'

    @IpcMethod()
    check() {
      return serializeAssetOperation(async () => {
        if (assetDirectory === null)
          throw new Error('Assets cannot be checked when using an in-memory database')
        await mkdir(assetDirectory, { recursive: true })
        const result = await checkManagedAssets(
          storage,
          assetDirectory,
          Date.now() - assetCheckSafetyWindow,
        )
        const statistics = await storage.getAssetStatistics()
        return {
          candidates: result.candidates.map(asset => ({
            byteSize: asset.byteSize,
            fileName: asset.fileName,
            originalFileName: asset.originalFileName,
          })),
          managedAssetCount: statistics.managedAssetCount,
          missingAssets: result.missingAssets,
          referencedAssetCount: statistics.referenceCount,
        }
      })
    }

    @IpcMethod()
    reclaim(input: ReclaimAssetsInput): Promise<ReclaimAssetsResult> {
      return serializeAssetOperation(async () => {
        if (assetDirectory === null)
          throw new Error('Assets cannot be reclaimed when using an in-memory database')
        if (typeof input !== 'object' || input === null || !Array.isArray(input.fileNames))
          throw new TypeError('Asset reclaim input is invalid')
        if (input.mode !== 'permanent' && input.mode !== 'trash')
          throw new TypeError('Asset reclaim mode is invalid')
        if (input.fileNames.some(fileName => typeof fileName !== 'string'))
          throw new TypeError('Asset file names must be strings')
        const fileNames = [...new Set(input.fileNames)]
        if (fileNames.length === 0)
          return { cancelled: false, failedFileNames: [], reclaimedFileNames: [] }

        if (input.mode === 'permanent') {
          const owner = BrowserWindow.fromWebContents(getIpcContext().sender)
          const options = {
            buttons: ['Cancel', 'Permanently Delete'],
            cancelId: 0,
            defaultId: 0,
            detail: 'These files could not be moved to the system Trash. Permanent deletion cannot be undone.',
            message: `Permanently delete ${fileNames.length} unreferenced asset${fileNames.length === 1 ? '' : 's'}?`,
            noLink: true,
            title: 'Delete Assets Permanently',
            type: 'warning' as const,
          }
          const confirmation = owner
            ? await dialog.showMessageBox(owner, options)
            : await dialog.showMessageBox(options)
          if (confirmation.response !== 1)
            return { cancelled: true, failedFileNames: [], reclaimedFileNames: [] }
        }

        const failedFileNames: string[] = []
        const reclaimedFileNames: string[] = []
        const unreferencedBefore = Date.now() - assetCheckSafetyWindow
        for (const fileName of fileNames) {
          const claimed = await storage.claimUnreferencedAsset({ fileName, unreferencedBefore })
          if (!claimed)
            continue
          const filePath = join(assetDirectory, fileName)
          try {
            if (input.mode === 'trash')
              await shell.trashItem(filePath)
            else
              await rm(filePath, { force: true })
          }
          catch {
            await storage.releaseAssetClaim({ fileName })
            failedFileNames.push(fileName)
            continue
          }
          await storage.completeAssetDeletion({ fileName })
          reclaimedFileNames.push(fileName)
        }
        return { cancelled: false, failedFileNames, reclaimedFileNames }
      })
    }

    @IpcMethod()
    importNetworkImage(input: ImportNetworkImageInput): Promise<SaveImageResult> {
      return serializeAssetOperation(async () => {
        if (typeof input !== 'object' || input === null || typeof input.source !== 'string')
          throw new TypeError('Network image input is invalid')
        const source = new URL(input.source)
        if (source.protocol !== 'http:' && source.protocol !== 'https:')
          throw new TypeError('Network images must use HTTP or HTTPS')
        if (assetDirectory === null)
          throw new Error('Images cannot be stored when using an in-memory database')
        const response = await net.fetch(source.toString())
        if (!response.ok)
          throw new Error(`Unable to download image: ${response.status} ${response.statusText}`)
        const responseUrl = new URL(response.url || source)
        if (responseUrl.protocol !== 'http:' && responseUrl.protocol !== 'https:')
          throw new TypeError('Network image redirected to an unsupported URL')
        const contentLength = Number(response.headers.get('content-length'))
        if (Number.isFinite(contentLength) && contentLength > maximumImageSize)
          throw new TypeError('Image must not exceed 50 MiB')
        const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim() ?? ''
        if (!mimeType.toLowerCase().startsWith('image/'))
          throw new TypeError(`Remote URL did not return an image: ${mimeType || 'unknown content type'}`)
        const encodedName = responseUrl.pathname.slice(responseUrl.pathname.lastIndexOf('/') + 1)
        let fileName: string
        try {
          fileName = decodeURIComponent(encodedName) || 'pasted-network-image'
        }
        catch {
          fileName = 'pasted-network-image'
        }
        return persistImage({
          data: await readImageResponse(response),
          fileName,
          mimeType,
        })
      })
    }

    @IpcMethod()
    saveImage(input: SaveImageInput): Promise<SaveImageResult> {
      return serializeAssetOperation(() => persistImage(input))
    }
  }

  return AssetService
}
