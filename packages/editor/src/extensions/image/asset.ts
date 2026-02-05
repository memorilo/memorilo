import type { EditorView } from '@tiptap/pm/view'
import { effectCommands } from '@memorilo/api/command'
import log from '@memorilo/api/log'
import { Duration, Effect } from 'effect'
import { extFromMime, inferFileExtension } from './file-ext'
import { getDataUrlMimeType } from './utils'

export function updateImageNodeByUploadId(
  view: EditorView,
  uploadId: string,
  patch: Record<string, any>,
) {
  // Async asset writes need to patch the *same* image node that was inserted earlier.
  // We store a temporary `uploadId` on the node and locate it later by scanning the doc.
  //
  // Why not keep a direct `pos` reference?
  // - Editor transactions can shift positions while the async job is running.
  // - `uploadId` is stable even if the node moves.
  const imageType = view.state.schema.nodes.image
  if (!imageType) {
    log.warn(`[image] update by uploadId skipped (missing image type) uploadId=${uploadId}`)
    return
  }

  let foundPos: number | null = null
  let foundNode: any = null
  view.state.doc.descendants((node, pos) => {
    if (node.type === imageType && node.attrs?.uploadId === uploadId) {
      foundPos = pos
      foundNode = node
      return false
    }
    return true
  })

  if (foundPos === null || !foundNode) {
    log.warn(
      `[image] update by uploadId not found uploadId=${uploadId} patchKeys=${Object.keys(patch).join(',')}`,
    )
    return
  }

  const tr = view.state.tr.setNodeMarkup(foundPos, undefined, {
    ...foundNode.attrs,
    ...patch,
  })
  view.dispatch(tr)
}

export function forkAssetTaskAndPatchImageByUploadId(params: {
  view: EditorView
  uploadId: string
  // Stored on the node as `uploadError` if the task fails; also used in logs.
  errorTag: string
  task: Effect.Effect<string, unknown>
  // Extra attrs to apply on success (in addition to `assetId` and clearing `uploadId`/`uploadError`).
  successAttrs?: Record<string, any>
}) {
  const { view, uploadId, errorTag, task, successAttrs } = params

  // Fire-and-forget asset write/download that patches the inserted image node by `uploadId`.
  log.info(`[image] asset task start tag=${errorTag} uploadId=${uploadId}`)
  const program = Effect.timed(task).pipe(
    Effect.tap(([duration, assetId]) =>
      Effect.sync(() => {
        const ms = Math.round(Duration.toMillis(duration))
        log.info(`[image] asset task ok tag=${errorTag} uploadId=${uploadId} assetId=${assetId} ms=${ms}`)
        updateImageNodeByUploadId(view, uploadId, {
          assetId,
          ...successAttrs,
          uploadId: null,
          uploadError: null,
        })
      }),
    ),
    Effect.catchAll(error =>
      Effect.sync(() => {
        log.error(
          `[image] asset task failed tag=${errorTag} uploadId=${uploadId} err=`,
          error,
        )
        updateImageNodeByUploadId(view, uploadId, {
          uploadId: null,
          uploadError: errorTag,
        })
      }),
    ),
    Effect.asVoid,
  )

  Effect.runFork(program)
}

export function addRemoteImageToAssets(url: string) {
  // Downloading from the WebView can fail due to CORS restrictions. We keep the
  // editor responsive by delegating the network request to the Rust backend.
  return effectCommands.addAssetFromUrl(url).pipe(
    Effect.map(asset => asset.assetId),
  )
}

export function addBase64ImageToAssets(dataUrl: string) {
  const mime = getDataUrlMimeType(dataUrl)
  const extension = extFromMime(mime)
  const meta = JSON.stringify({ source: 'data-url', mime })

  return effectCommands.addAssetFromBase64(dataUrl, extension, meta).pipe(
    Effect.map(asset => asset.assetId),
  )
}

export function addFileToAssets(file: File) {
  const extension = inferFileExtension(file)
  const meta = JSON.stringify({
    source: 'file',
    name: file.name ?? null,
    type: file.type ?? null,
    size: typeof file.size === 'number' ? file.size : null,
  })

  return Effect.tryPromise({
    try: () => file.arrayBuffer(),
    catch: error => error,
  }).pipe(
    Effect.map(buffer => new Uint8Array(buffer)),
    Effect.flatMap(bytes => effectCommands.addAssetFromBytes(Array.from(bytes), extension, meta)),
    Effect.map(asset => asset.assetId),
  )
}
