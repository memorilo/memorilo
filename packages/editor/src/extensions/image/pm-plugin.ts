import type { NodeType, Slice } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { Fragment, Slice as ProseMirrorSlice } from '@tiptap/pm/model'
import { Plugin, TextSelection } from '@tiptap/pm/state'
import { dropPoint } from '@tiptap/pm/transform'
import { Console, Effect } from 'effect'
import { isEmpty } from 'es-toolkit/compat'
import { isString } from 'es-toolkit/predicate'
import { addBase64ImageToAssets, addFileToAssets, addRemoteImageToAssets, forkAssetTaskAndPatchImageByUploadId } from './asset'
import {
  createUploadId,
  getDataUrlMimeType,
  isBase64DataImageUrl,
  isRemoteHttpUrl,
} from './utils'

interface SliceImageAssetJob { uploadId: string, src: string, kind: 'url' | 'data-url' }

// When the selection is inside an empty paragraph, ProseMirror tends to *replace* that paragraph
// with the inserted block node. For images we prefer keeping the paragraph so users can keep
// typing there, therefore we insert the image *after* the empty paragraph.
function shouldInsertAfterEmptyTextBlock($pos: any) {
  const parent = $pos?.parent
  if (!parent) {
    return false
  }
  return parent.isTextblock
    && !parent.type.spec.code
    && parent.childCount === 0
}

function sliceHasImage(slice: Slice, imageType: NodeType) {
  if (slice.content.size === 0) {
    return false
  }

  let found = false
  slice.content.forEach((node) => {
    if (found)
      return
    if (node.type === imageType) {
      found = true
      return
    }

    node.descendants((child) => {
      if (found)
        return false
      if (child.type === imageType) {
        found = true
        return false
      }
      return undefined
    })
  })

  return found
}

function mapPastedSliceImages(
  slice: Slice,
  imageType: NodeType,
  mapAttrs: (attrs: Record<string, any>) => Record<string, any>,
) {
  const mapNode = (node: any): any => {
    if (node.type === imageType) {
      const nextAttrs = mapAttrs(node.attrs ?? {})
      return imageType.create(nextAttrs, undefined, node.marks)
    }

    if (!node.content || node.content.size === 0) {
      return node
    }

    const nextContent = Fragment.fromArray(
      node.content.content.map((child: any) => mapNode(child)),
    )
    return node.copy(nextContent)
  }

  const nextContent = Fragment.fromArray(slice.content.content.map((node: any) => mapNode(node)))
  return new ProseMirrorSlice(nextContent, slice.openStart, slice.openEnd)
}

function prepareSliceImageAssetJobs(params: {
  slice: Slice
  imageType: NodeType
  downloadImage: boolean
}) {
  const { slice, imageType, downloadImage } = params

  const jobs: SliceImageAssetJob[] = []
  // Convert pasted/dropped `<img>` nodes into "placeholder" nodes that will be resolved later:
  // - remote http/https (when enabled): download into assets on the backend
  // - data-url: store into assets and avoid persisting base64 in the document
  const nextSlice = mapPastedSliceImages(slice, imageType, (attrs) => {
    const src = attrs.src
    if (!isString(src) || isEmpty(src)) {
      return attrs
    }
    if (isString(attrs.assetId) && !isEmpty(attrs.assetId)) {
      return attrs
    }
    if (isString(attrs.uploadId) && !isEmpty(attrs.uploadId)) {
      return attrs
    }

    const shouldDownloadRemote = downloadImage && isRemoteHttpUrl(src)
    const shouldStoreBase64 = isBase64DataImageUrl(src)
    if (!shouldDownloadRemote && !shouldStoreBase64) {
      return attrs
    }

    const uploadId = createUploadId()
    jobs.push({ uploadId, src, kind: shouldStoreBase64 ? 'data-url' : 'url' })
    return {
      ...attrs,
      src: null,
      assetId: null,
      uploadId,
      uploadError: null,
    }
  })

  return { nextSlice, jobs }
}

function queueSliceImageAssetJobs(params: {
  view: EditorView
  jobs: SliceImageAssetJob[]
  origin: string
}) {
  const { view, jobs, origin } = params
  if (jobs.length === 0) {
    return
  }

  // Jobs must run after the slice is inserted, otherwise `updateImageNodeByUploadId`
  // won't find nodes by `uploadId`. `queueMicrotask` is enough here because insertion
  // happens in the same tick.
  queueMicrotask(() => {
    const program = Effect.gen(function* () {
      for (const job of jobs) {
        if (job.kind === 'data-url') {
          forkAssetTaskAndPatchImageByUploadId({
            view,
            uploadId: job.uploadId,
            errorTag: 'store data-url',
            task: addBase64ImageToAssets(job.src),
            successAttrs: { src: null },
          })
          yield* Console.debug(
            `[image] data-url queued origin=${origin} uploadId=${job.uploadId} mime=${getDataUrlMimeType(job.src) ?? 'unknown'}`,
          )
        }
        else {
          forkAssetTaskAndPatchImageByUploadId({
            view,
            uploadId: job.uploadId,
            errorTag: 'download',
            task: addRemoteImageToAssets(job.src),
            successAttrs: { src: null },
          })
          yield* Console.debug(`[image] download queued origin=${origin} uploadId=${job.uploadId} url=${job.src}`)
        }
      }
    })

    Effect.runPromise(program)
  })
}

export function createImageProseMirrorPlugin(params: { downloadImage: boolean }) {
  const { downloadImage } = params

  return new Plugin({
    props: {
      transformPasted: (slice, view) => {
        const imageType = view.state.schema.nodes.image
        if (!imageType || !sliceHasImage(slice, imageType)) {
          return slice
        }

        const { nextSlice, jobs } = prepareSliceImageAssetJobs({ slice, imageType, downloadImage })
        if (jobs.length > 0) {
          Effect.runPromise(Console.info(
            `[image] transformPasted queued jobs=${jobs.length} downloadImage=${downloadImage}`,
          ))
          queueSliceImageAssetJobs({ view, jobs, origin: 'transformPasted' })
        }
        return nextSlice
      },

      handlePaste: (view, _event, slice) => {
        const event = _event as ClipboardEvent | undefined

        const files = Array.from(event?.clipboardData?.files ?? [])
        const imageFiles = files.filter(file => file.type.startsWith('image/'))
        if (imageFiles.length > 0) {
          const imageType = view.state.schema.nodes.image
          if (!imageType) {
            return false
          }

          const program = Effect.gen(function* () {
            yield* Console.info(`[image] paste files detected count=${imageFiles.length}`)
            const uploadIds = imageFiles.map(() => createUploadId())
            const nodes = imageFiles.map((file, i) =>
              imageType.create({
                src: null,
                assetId: null,
                uploadId: uploadIds[i],
                title: null,
                width: null,
                height: null,
              }),
            )
            const fileSlice = new ProseMirrorSlice(Fragment.fromArray(nodes), 0, 0)

            const $from = view.state.selection.$from
            const insertPos = shouldInsertAfterEmptyTextBlock($from) ? $from.after() : null
            const hasInsertPos = typeof insertPos === 'number'
            const tr = hasInsertPos
              ? view.state.tr.replaceRange(insertPos, insertPos, fileSlice)
              : view.state.tr.replaceSelection(fileSlice)
            view.dispatch(tr.scrollIntoView())
            yield* Console.info(`[image] paste files inserted uploadIds=${uploadIds.join(',')}`)

            for (let i = 0; i < imageFiles.length; i += 1) {
              const uploadId = uploadIds[i]!
              const file = imageFiles[i]!
              forkAssetTaskAndPatchImageByUploadId({
                view,
                uploadId,
                errorTag: 'paste file',
                task: addFileToAssets(file),
              })
              yield* Console.debug(
                `[image] paste file queued uploadId=${uploadId} name=${file.name} type=${file.type} size=${file.size}`,
              )
            }
          })

          Effect.runPromise(program)

          return true
        }

        const imageType = view.state.schema.nodes.image
        if (!imageType || !sliceHasImage(slice, imageType)) {
          return false
        }

        const $from = view.state.selection.$from
        if (!shouldInsertAfterEmptyTextBlock($from)) {
          return false
        }

        // We handle this path ourselves (instead of letting the editor replace selection)
        // so we can preserve the empty paragraph and still schedule asset jobs.
        const { nextSlice, jobs } = prepareSliceImageAssetJobs({ slice, imageType, downloadImage })
        const program = Effect.gen(function* () {
          const insertPos = $from.after()
          const tr = view.state.tr.replaceRange(insertPos, insertPos, nextSlice)
          view.dispatch(tr.scrollIntoView())
          yield* Console.info('[image] paste slice inserted after empty paragraph')
          if (jobs.length > 0) {
            yield* Console.info(`[image] paste slice queued jobs=${jobs.length} downloadImage=${downloadImage}`)
            queueSliceImageAssetJobs({ view, jobs, origin: 'paste slice' })
          }
        })

        Effect.runPromise(program)
        return true
      },

      handleDrop: (view, event, slice) => {
        const dragEvent = event as DragEvent

        const files = Array.from(dragEvent.dataTransfer?.files ?? [])
        const imageFiles = files.filter(file => file.type.startsWith('image/'))
        if (imageFiles.length > 0) {
          const imageType = view.state.schema.nodes.image
          if (!imageType) {
            return false
          }

          const coords = view.posAtCoords({ left: dragEvent.clientX, top: dragEvent.clientY })
          if (!coords) {
            return false
          }

          const uploadIds = imageFiles.map(() => createUploadId())
          const nodes = imageFiles.map((file, i) =>
            imageType.create({
              src: null,
              assetId: null,
              uploadId: uploadIds[i],
              title: null,
              width: null,
              height: null,
            }),
          )
          const fileSlice = new ProseMirrorSlice(Fragment.fromArray(nodes), 0, 0)

          const $drop = view.state.doc.resolve(coords.pos)
          let tr = view.state.tr
          if (shouldInsertAfterEmptyTextBlock($drop)) {
            const insertPos = $drop.after()
            tr = tr.replaceRange(insertPos, insertPos, fileSlice)
          }
          else {
            const safePos = dropPoint(tr.doc, coords.pos, fileSlice)
            if (safePos === null) {
              return false
            }
            tr = tr.replaceRange(safePos, safePos, fileSlice)
            const selectionPos = Math.min(safePos + 1, tr.doc.content.size)
            tr = tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)))
          }

          const program = Effect.gen(function* () {
            yield* Console.info(`[image] drop files detected count=${imageFiles.length}`)
            view.dispatch(tr.scrollIntoView())
            yield* Console.info(`[image] drop files inserted uploadIds=${uploadIds.join(',')}`)

            for (let i = 0; i < imageFiles.length; i += 1) {
              const uploadId = uploadIds[i]!
              const file = imageFiles[i]!
              forkAssetTaskAndPatchImageByUploadId({
                view,
                uploadId,
                errorTag: 'drop file',
                task: addFileToAssets(file),
              })
              yield* Console.debug(
                `[image] drop file queued uploadId=${uploadId} name=${file.name} type=${file.type} size=${file.size}`,
              )
            }
          })

          Effect.runPromise(program)

          return true
        }

        const imageType = view.state.schema.nodes.image
        if (!imageType || !sliceHasImage(slice, imageType)) {
          return false
        }

        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (!coords) {
          return false
        }

        const { nextSlice, jobs } = prepareSliceImageAssetJobs({ slice, imageType, downloadImage })

        const $drop = view.state.doc.resolve(coords.pos)
        let tr = view.state.tr
        let insertMode: 'after-empty' | 'drop-point' = 'drop-point'
        if (shouldInsertAfterEmptyTextBlock($drop)) {
          const insertPos = $drop.after()
          tr = tr.replaceRange(insertPos, insertPos, nextSlice)
          insertMode = 'after-empty'
        }
        else {
          const safePos = dropPoint(tr.doc, coords.pos, nextSlice)
          if (safePos === null) {
            return false
          }
          tr = tr.replaceRange(safePos, safePos, nextSlice)
          const selectionPos = Math.min(safePos + 1, tr.doc.content.size)
          tr = tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos)))
        }

        const program = Effect.gen(function* () {
          if (insertMode === 'after-empty') {
            yield* Console.info('[image] drop slice inserted after empty paragraph')
          }
          else {
            yield* Console.info('[image] drop slice inserted at dropPoint')
          }
          view.dispatch(tr.scrollIntoView())
          if (jobs.length > 0) {
            yield* Console.info(`[image] drop slice queued jobs=${jobs.length} downloadImage=${downloadImage}`)
            queueSliceImageAssetJobs({ view, jobs, origin: 'drop slice' })
          }
        })

        Effect.runPromise(program)
        return true
      },
    },
  })
}
