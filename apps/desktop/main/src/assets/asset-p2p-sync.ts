import type { AssetSyncManifest, EditorAssetStorage, StoredAsset } from '@memorilo/editor-storage'
import type { SyncAssetManifest } from '@memorilo/sync'
import type { P2pApplication, SyncObjectTransferStore } from '@memorilo/sync/node'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { link, mkdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

interface DesktopAssetSyncOptions {
  readonly assetDirectory: string
  readonly assets: EditorAssetStorage
  readonly application: () => P2pApplication
  readonly deviceId: () => string
  readonly notifyChangesAvailable: () => Promise<void>
}

export interface DesktopAssetSync {
  readonly applyAssetManifests: (manifests: readonly SyncAssetManifest[]) => Promise<void>
  readonly ensureBaselines: () => Promise<void>
  readonly getAssetManifests: (since: Readonly<Record<string, number>>) => Promise<readonly SyncAssetManifest[]>
  readonly getAssetVersionVector: () => Promise<Readonly<Record<string, number>>>
  readonly objectStore: SyncObjectTransferStore
  readonly prepareAssetManifestsForPeer: (manifests: readonly SyncAssetManifest[], peer: { readonly peerId: string }) => Promise<void>
  readonly recordLocalDelete: (asset: StoredAsset) => Promise<void>
  readonly recordLocalPut: (asset: StoredAsset) => Promise<void>
}

function assetPath(directory: string, fileName: string): string {
  if (basename(fileName) !== fileName || !/^[0-9a-f-]+\.[a-z0-9]+$/u.test(fileName))
    throw new TypeError('Asset file name has an invalid format')
  return join(directory, fileName)
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path))
    hash.update(chunk)
  return hash.digest('hex')
}

function asSyncManifest(manifest: AssetSyncManifest): SyncAssetManifest {
  return manifest
}

export function createDesktopAssetSync(options: DesktopAssetSyncOptions): DesktopAssetSync {
  const appendPut = async (asset: StoredAsset): Promise<void> => {
    const path = assetPath(options.assetDirectory, asset.fileName)
    const [metadata, contentHash] = await Promise.all([stat(path), hashFile(path)])
    if (metadata.size !== asset.byteSize)
      throw new Error(`Asset length changed before synchronization: ${asset.fileName}`)
    await options.assets.appendLocalSyncManifest({
      contentHash,
      contentLength: asset.byteSize,
      contentType: asset.mimeType,
      createdAt: asset.createdAt,
      deviceId: options.deviceId(),
      fileName: asset.fileName,
      operation: 'put',
      originalFileName: asset.originalFileName,
    })
    await options.notifyChangesAvailable()
  }

  const hasObject = async (manifest: SyncAssetManifest): Promise<boolean> => {
    if (manifest.operation !== 'put' || manifest.contentHash === null || manifest.contentLength === null)
      return false
    const path = assetPath(options.assetDirectory, manifest.fileName)
    try {
      const metadata = await stat(path)
      if (metadata.size !== manifest.contentLength || await hashFile(path) !== manifest.contentHash)
        throw new Error('Existing asset bytes conflict with the incoming manifest')
      return true
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return false
      throw error
    }
  }
  const objectStore: SyncObjectTransferStore = {
    has: hasObject,
    put: async (manifest, body) => {
      if (manifest.operation !== 'put' || manifest.contentHash === null || manifest.contentLength === null)
        throw new Error('Asset object requires a put manifest')
      const path = assetPath(options.assetDirectory, manifest.fileName)
      const temporaryPath = join(options.assetDirectory, `.${manifest.fileName}.${randomUUID()}.tmp`)
      await mkdir(options.assetDirectory, { recursive: true })
      const hash = createHash('sha256')
      let received = 0
      const verified = (async function* () {
        for await (const chunk of body) {
          received += chunk.byteLength
          hash.update(chunk)
          yield chunk
        }
      })()
      try {
        await pipeline(verified, createWriteStream(temporaryPath, { flags: 'wx' }))
        if (received !== manifest.contentLength)
          throw new Error(`Asset length mismatch: expected ${manifest.contentLength}, received ${received}`)
        if (hash.digest('hex') !== manifest.contentHash)
          throw new Error('Asset content hash does not match its manifest')
        try {
          await link(temporaryPath, path)
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
            throw error
          if (!await hasObject(manifest))
            throw new Error('Existing asset conflicts with the incoming object')
        }
      }
      finally {
        await rm(temporaryPath, { force: true })
      }
    },
  }

  return {
    applyAssetManifests: async (manifests) => {
      for (const manifest of manifests) {
        if (manifest.operation !== 'put')
          continue
        if (manifest.contentLength === null || manifest.contentType === null)
          throw new Error('Asset put manifest is incomplete')
        const path = assetPath(options.assetDirectory, manifest.fileName)
        const metadata = await stat(path)
        if (metadata.size !== manifest.contentLength)
          throw new Error(`Asset object is missing or incomplete: ${manifest.fileName}`)
        await options.assets.register({
          byteSize: manifest.contentLength,
          createdAt: manifest.createdAt,
          fileName: manifest.fileName,
          mimeType: manifest.contentType,
          originalFileName: manifest.originalFileName,
        })
      }
      await options.assets.recordReceivedSyncManifests(manifests)
    },
    ensureBaselines: async () => {
      const [assets, manifests] = await Promise.all([
        options.assets.list(),
        options.assets.listSyncManifests({}),
      ])
      const latest = new Map<string, AssetSyncManifest>()
      for (const manifest of manifests)
        latest.set(manifest.fileName, manifest)
      for (const asset of assets) {
        if (latest.get(asset.fileName)?.operation !== 'put')
          await appendPut(asset)
      }
    },
    getAssetManifests: async since => (await options.assets.listSyncManifests(since)).map(asSyncManifest),
    getAssetVersionVector: () => options.assets.getSyncFrontier(),
    objectStore,
    prepareAssetManifestsForPeer: async (manifests, peer) => {
      for (const manifest of manifests) {
        if (manifest.operation !== 'put')
          continue
        const body = (async function* () {
          for await (const chunk of createReadStream(assetPath(options.assetDirectory, manifest.fileName)))
            yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
        })()
        await options.application().putObject(peer.peerId, manifest, body)
      }
    },
    recordLocalDelete: async (asset) => {
      await options.assets.appendLocalSyncManifest({
        contentHash: null,
        contentLength: null,
        contentType: null,
        createdAt: Date.now(),
        deviceId: options.deviceId(),
        fileName: asset.fileName,
        operation: 'delete',
        originalFileName: asset.originalFileName,
      })
      await options.notifyChangesAvailable()
    },
    recordLocalPut: appendPut,
  }
}
