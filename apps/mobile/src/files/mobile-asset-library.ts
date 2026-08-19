import type { EditorAssetStorage } from '@memorilo/editor-storage'
import { assetSource, parseAssetFileName } from '@memorilo/application/asset-uri'
import { Directory, File, Paths } from 'expo-file-system'

interface MobileAssetLibraryOptions {
  registerAsset: EditorAssetStorage['register']
  storage: Pick<EditorAssetStorage, 'claimUnreferenced' | 'completeDeletion' | 'listUnreferenced' | 'releaseClaim'>
}

function extensionFor(fileName: string, mimeType: string): string {
  const suffix = fileName.toLowerCase().match(/\.([a-z0-9]{1,8})$/u)?.[1]
  if (suffix)
    return suffix
  const mimeSuffix = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
  }[mimeType]
  if (!mimeSuffix)
    throw new TypeError(`Unsupported mobile asset MIME type: ${mimeType}`)
  return mimeSuffix
}

export class MobileAssetLibrary {
  readonly #directory: Directory
  readonly #registerAsset: MobileAssetLibraryOptions['registerAsset']
  readonly #storage: MobileAssetLibraryOptions['storage']
  #mutation: Promise<void> = Promise.resolve()

  private constructor(directory: Directory, options: MobileAssetLibraryOptions) {
    this.#directory = directory
    this.#registerAsset = options.registerAsset
    this.#storage = options.storage
  }

  static async open(options: MobileAssetLibraryOptions): Promise<MobileAssetLibrary> {
    const directory = new Directory(Paths.document, 'memorilo-assets')
    directory.create({ idempotent: true, intermediates: true })
    return new MobileAssetLibrary(directory, options)
  }

  async close(): Promise<void> {
    await this.#mutation
  }

  async resolve(source: string): Promise<string> {
    const fileName = parseAssetFileName(source)
    if (!fileName)
      return source
    const file = new File(this.#directory, fileName)
    if (!file.exists)
      throw new Error(`Mobile asset ${fileName} is missing`)
    return file.uri
  }

  async saveImage(input: {
    data: Uint8Array
    fileName: string
    mimeType: string
  }): Promise<{ src: string }> {
    if (input.data.byteLength <= 0)
      throw new RangeError('Mobile image asset must contain bytes')
    const extension = extensionFor(input.fileName, input.mimeType)
    const fileName = `${crypto.randomUUID()}.${extension}`
    const destination = new File(this.#directory, fileName)
    await this.#mutate(async () => {
      destination.create({ intermediates: true })
      try {
        destination.write(input.data)
        await this.#registerAsset({
          byteSize: input.data.byteLength,
          fileName,
          mimeType: input.mimeType,
          originalFileName: input.fileName,
        })
      }
      catch (error) {
        if (destination.exists)
          destination.delete()
        throw error
      }
    })
    return { src: assetSource(fileName) }
  }

  async collectUnreferenced(input: { unreferencedBefore: number }): Promise<{ bytesFreed: number, removedCount: number }> {
    if (!Number.isFinite(input.unreferencedBefore))
      throw new TypeError('Asset maintenance cutoff must be finite')
    return this.#mutate(async () => {
      let bytesFreed = 0
      let removedCount = 0
      const candidates = await this.#storage.listUnreferenced({ unreferencedBefore: input.unreferencedBefore })
      for (const candidate of candidates) {
        const claimed = await this.#storage.claimUnreferenced({
          fileName: candidate.fileName,
          unreferencedBefore: input.unreferencedBefore,
        })
        if (!claimed)
          continue
        const file = new File(this.#directory, claimed.fileName)
        try {
          if (file.exists)
            file.delete()
          await this.#storage.completeDeletion({ fileName: claimed.fileName })
          bytesFreed += claimed.byteSize
          removedCount += 1
        }
        catch (error) {
          await this.#storage.releaseClaim({ fileName: claimed.fileName }).catch(() => undefined)
          throw error
        }
      }
      return { bytesFreed, removedCount }
    })
  }

  async #mutate<Result>(operation: () => Promise<Result>): Promise<Result> {
    const next = this.#mutation.then(operation)
    this.#mutation = next.then(() => undefined, () => undefined)
    return next
  }
}
