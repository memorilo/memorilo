import type { EditorView } from '@tiptap/pm/view'
import { runFork } from '@memorilo/api-spec'
import { AssetsService } from '@memorilo/api-spec/command'
import { Console, Duration, Effect } from 'effect'
import { extFromMime, inferFileExtension } from './file-ext'
import { getDataUrlMimeType } from './utils'

export function updateImageNodeByUploadId(
  view: EditorView,
  uploadId: string,
  patch: Record<string, any>,
): Effect.Effect<void, never> {
  // Async asset writes need to patch the *same* image node that was inserted earlier.
  // We store a temporary `uploadId` on the node and locate it later by scanning the doc.
  //
  // Why not keep a direct `pos` reference?
  // - Editor transactions can shift positions while the async job is running.
  // - `uploadId` is stable even if the node moves.
  return Effect.sync(() => {
    const imageType = view.state.schema.nodes.image
    if (!imageType) {
      return { status: 'missing-type' as const }
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
      return { status: 'not-found' as const, patchKeys: Object.keys(patch) }
    }

    const tr = view.state.tr.setNodeMarkup(foundPos, undefined, {
      ...foundNode.attrs,
      ...patch,
    })
    view.dispatch(tr)
    return { status: 'ok' as const }
  }).pipe(
    Effect.flatMap((result) => {
      if (result.status === 'missing-type') {
        return Console.warn(`[image] update by uploadId skipped (missing image type) uploadId=${uploadId}`)
      }
      if (result.status === 'not-found') {
        return Console.warn(
          `[image] update by uploadId not found uploadId=${uploadId} patchKeys=${result.patchKeys.join(',')}`,
        )
      }
      return Effect.void
    }),
  )
}

export function forkAssetTaskAndPatchImageByUploadId<R>(params: {
  view: EditorView
  uploadId: string
  // Stored on the node as `uploadError` if the task fails; also used in logs.
  errorTag: string
  task: Effect.Effect<string, unknown, R>
  // Extra attrs to apply on success (in addition to `assetId` and clearing `uploadId`/`uploadError`).
  successAttrs?: Record<string, any>
}) {
  const { view, uploadId, errorTag, task, successAttrs } = params

  // Fire-and-forget asset write/download that patches the inserted image node by `uploadId`.
  const program = Effect.gen(function* () {
    yield* Console.info(`[image] asset task start tag=${errorTag} uploadId=${uploadId}`)
    const [duration, assetId] = yield* Effect.timed(task)
    const ms = Math.round(Duration.toMillis(duration))
    yield* Console.info(`[image] asset task ok tag=${errorTag} uploadId=${uploadId} assetId=${assetId} ms=${ms}`)
    yield* updateImageNodeByUploadId(view, uploadId, {
      assetId,
      ...successAttrs,
      uploadId: null,
      uploadError: null,
    })
  }).pipe(
    Effect.catchAll(error =>
      Console.error(
        `[image] asset task failed tag=${errorTag} uploadId=${uploadId} err=`,
        error,
      ).pipe(
        Effect.zipRight(updateImageNodeByUploadId(view, uploadId, {
          uploadId: null,
          uploadError: errorTag,
        })),
      ),
    ),
    Effect.asVoid,
  )

  runFork(program)
}

export function addRemoteImageToAssets(url: string) {
  // Downloading from the WebView can fail due to CORS restrictions. We keep the
  // editor responsive by delegating the network request to the Rust backend.
  return Effect.gen(function* () {
    const assetsService = yield* AssetsService
    const asset = yield* assetsService.addAssetFromUrl(url)
    return asset.assetId
  })
}

export function addBase64ImageToAssets(dataUrl: string) {
  const mime = getDataUrlMimeType(dataUrl)
  const extension = extFromMime(mime)
  const meta = JSON.stringify({ source: 'data-url', mime })

  return Effect.gen(function* () {
    const assetsService = yield* AssetsService
    const asset = yield* assetsService.addAssetFromBase64(dataUrl, extension, meta)
    return asset.assetId
  })
}

export function addFileToAssets(file: File) {
  const extension = inferFileExtension(file)
  const meta = JSON.stringify({
    source: 'file',
    name: file.name ?? null,
    type: file.type ?? null,
    size: typeof file.size === 'number' ? file.size : null,
  })

  return Effect.gen(function* () {
    const assetsService = yield* AssetsService
    const buffer = yield* Effect.tryPromise({
      try: () => file.arrayBuffer(),
      catch: error => error,
    })
    const bytes = new Uint8Array(buffer)
    const asset = yield* assetsService.addAssetFromBytes(Array.from(bytes), extension, meta)
    return asset.assetId
  })
}
