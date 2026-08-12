import type { AssetReferenceProjection, EditorStorage, StoredAsset } from '@memorilo/editor-storage'
import { readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { createEditorNote } from '@memorilo/editor/note'

import { assetFileNamePattern, projectNoteAssetReferences } from './asset-references'

export interface MissingAsset {
  fileName: string
  originalFileName: string
  referenceCount: number
}

export interface ManagedAssetCheck {
  candidates: readonly StoredAsset[]
  missingAssets: readonly MissingAsset[]
}

const mimeTypesByExtension: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
}

async function registerExistingAssets(storage: EditorStorage, assetDirectory: string): Promise<void> {
  const entries = await readdir(assetDirectory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile() || !assetFileNamePattern.test(entry.name))
      continue
    const mimeType = mimeTypesByExtension[extname(entry.name)]
    if (!mimeType)
      continue
    const metadata = await stat(join(assetDirectory, entry.name))
    if (metadata.size === 0)
      continue
    await storage.assets.register({
      byteSize: metadata.size,
      createdAt: metadata.birthtimeMs || metadata.mtimeMs,
      fileName: entry.name,
      mimeType,
      originalFileName: entry.name,
    })
  }
}

async function reconcileStoredNote(
  storage: EditorStorage,
  noteId: string,
): Promise<readonly AssetReferenceProjection[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const stored = await storage.notes.getNote({ noteId })
    const note = createEditorNote({
      id: stored.id,
      snapshot: stored.snapshot,
      title: stored.title,
      updates: stored.updates.map(update => update.update),
    })
    const references = projectNoteAssetReferences(note)
    if (await storage.notes.reconcileNoteAssetReferences({
      allowedMissingAssetFileNames: references.map(reference => reference.fileName),
      expectedLatestSequence: stored.latestSequence,
      noteId,
      references,
    })) {
      return references
    }
  }
  throw new Error(`Asset check could not obtain a stable version of Note ${noteId}`)
}

async function reconcileAllNotes(storage: EditorStorage): Promise<ReadonlyMap<string, number>> {
  const references = new Map<string, number>()
  const noteIds = await storage.notes.listNoteIds()
  for (const noteId of noteIds) {
    for (const reference of await reconcileStoredNote(storage, noteId))
      references.set(reference.fileName, (references.get(reference.fileName) ?? 0) + reference.count)
  }
  return references
}

async function recoverInterruptedReclaims(storage: EditorStorage, assetDirectory: string): Promise<void> {
  for (const asset of await storage.assets.listClaimed()) {
    try {
      await stat(join(assetDirectory, asset.fileName))
      await storage.assets.releaseClaim({ fileName: asset.fileName })
    }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined
      if (code === 'ENOENT')
        await storage.assets.completeDeletion({ fileName: asset.fileName })
      else
        throw error
    }
  }
}

async function findMissingAssets(
  storage: EditorStorage,
  assetDirectory: string,
  references: ReadonlyMap<string, number>,
): Promise<readonly MissingAsset[]> {
  const assets = new Map((await storage.assets.list()).map(asset => [asset.fileName, asset]))
  const missing: MissingAsset[] = []
  for (const [fileName, referenceCount] of references) {
    let exists = false
    try {
      exists = (await stat(join(assetDirectory, fileName))).isFile()
    }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined
      if (code !== 'ENOENT')
        throw error
    }
    if (!exists) {
      missing.push({
        fileName,
        originalFileName: assets.get(fileName)?.originalFileName ?? fileName,
        referenceCount,
      })
    }
  }
  return missing.sort((left, right) => left.originalFileName.localeCompare(right.originalFileName))
}

export async function checkManagedAssets(
  storage: EditorStorage,
  assetDirectory: string,
  unreferencedBefore: number,
): Promise<ManagedAssetCheck> {
  await recoverInterruptedReclaims(storage, assetDirectory)
  await registerExistingAssets(storage, assetDirectory)
  const references = await reconcileAllNotes(storage)
  const [candidates, missingAssets] = await Promise.all([
    storage.assets.listUnreferenced({ unreferencedBefore }),
    findMissingAssets(storage, assetDirectory, references),
  ])
  return { candidates, missingAssets }
}
