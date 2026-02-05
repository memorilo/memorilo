import type { CommandProps } from '@tiptap/core'
import type { EditorView } from '@tiptap/pm/view'
import log from '@memorilo/api/log'
import { addBase64ImageToAssets, addRemoteImageToAssets, forkAssetTaskAndPatchImageByUploadId } from './asset'
import {
  createUploadId,
  getDataUrlMimeType,
  isBase64DataImageUrl,
  isRemoteHttpUrl,
} from './utils'

type ParentSetImage = ((attrs: any) => (props: CommandProps) => boolean) | undefined

export function createSetImageCommand(params: {
  parentSetImage: ParentSetImage
  downloadImage: boolean
  getView: () => EditorView | null | undefined
}) {
  const { parentSetImage, downloadImage, getView } = params

  return (attrs: Record<string, any>) => (props: CommandProps) => {
    const src = attrs?.src as string | undefined
    const srcForLog = typeof src === 'string' && src.startsWith('data:')
      ? 'data-url'
      : src
    const existingAssetId = attrs?.assetId as string | null | undefined
    const existingUploadId = attrs?.uploadId as string | null | undefined

    // We avoid storing data-urls in the document:
    // - the base64 payload can be huge (bad for Yjs/doc size)
    // - we want a stable `assetId` source of truth
    const shouldStoreBase64 = Boolean(
      !existingAssetId
      && typeof src === 'string'
      && src.length > 0
      && isBase64DataImageUrl(src),
    )
    // When enabled, remote http/https images are downloaded into local assets.
    // We keep `src` empty to avoid a network fallback (requirement: no url fallback when downloaded).
    const shouldDownload = Boolean(
      downloadImage
      && !existingAssetId
      && typeof src === 'string'
      && src.length > 0
      && isRemoteHttpUrl(src),
    )

    const uploadId = (shouldDownload || shouldStoreBase64)
      ? createUploadId()
      : (existingUploadId ?? null)

    log.debug(
      `[image] setImage src=${srcForLog} downloadImage=${downloadImage} shouldDownload=${shouldDownload} shouldStoreBase64=${shouldStoreBase64} hasAssetId=${Boolean(existingAssetId)}`,
    )

    const nextAttrs = {
      ...attrs,
      // For "download/store" flows, we insert a placeholder node that is resolved later by `uploadId`.
      // This keeps the editor responsive and avoids persisting url/base64 into the document.
      ...(shouldDownload || shouldStoreBase64 ? { src: null, assetId: null } : {}),
      uploadId,
      uploadError: null,
    }

    let inserted = false
    const parentCommand = parentSetImage?.(nextAttrs)
    if (!parentCommand) {
      return false
    }

    const { selection } = props.state
    const $from = selection.$from
    const parent = $from.parent
    const shouldInsertAfterEmptyTextBlock = selection.empty
      && parent.isTextblock
      && !parent.type.spec.code
      && parent.childCount === 0

    if (shouldInsertAfterEmptyTextBlock) {
      // TipTap's insertContentAt() replaces an empty textblock with a block node by design.
      // For images we want to keep the paragraph so users can keep typing there.
      const imageType = props.state.schema.nodes.image
      if (!imageType) {
        return false
      }
      if (props.dispatch) {
        const insertPos = $from.after()
        const tr = props.state.tr.insert(insertPos, imageType.create(nextAttrs))
        props.dispatch(tr)
      }
      inserted = true
      log.info(
        `[image] inserted (after empty paragraph) uploadId=${uploadId ?? 'none'} assetId=${existingAssetId ?? 'none'} src=${srcForLog}`,
      )
    }
    else {
      inserted = parentCommand(props)
      if (inserted) {
        log.info(
          `[image] inserted (default) uploadId=${uploadId ?? 'none'} assetId=${existingAssetId ?? 'none'} src=${srcForLog}`,
        )
      }
    }

    if (!inserted) {
      return false
    }

    const view = getView()
    if (!view || !uploadId) {
      return true
    }

    if (shouldDownload) {
      forkAssetTaskAndPatchImageByUploadId({
        view,
        uploadId,
        errorTag: 'download',
        task: addRemoteImageToAssets(src!),
        successAttrs: { src: null },
      })
    }

    if (shouldStoreBase64) {
      forkAssetTaskAndPatchImageByUploadId({
        view,
        uploadId,
        errorTag: 'store data-url',
        task: addBase64ImageToAssets(src!),
        successAttrs: { src: null },
      })
      log.debug(`[image] data-url queued uploadId=${uploadId} mime=${getDataUrlMimeType(src!) ?? 'unknown'}`)
    }

    return true
  }
}
