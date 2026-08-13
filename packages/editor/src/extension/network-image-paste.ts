import type { Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { EditorAdapters } from '../adapters/editor-adapters'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { definePasteHandler, defineUpdateHandler, union } from 'prosekit/core'
import { insertImage, replaceImageURL } from 'prosekit/extensions/image'
import { Fragment, Slice } from 'prosekit/pm/model'

const networkProtocols = new Set(['http:', 'https:'])
let pasteSequence = 0

function networkImageUrl(source: string): string | null {
  let url: URL
  try {
    url = new URL(source.trim())
  }
  catch {
    return null
  }
  return networkProtocols.has(url.protocol) ? url.toString() : null
}

function temporaryImageSource(source: string): string {
  const url = new URL(source)
  url.hash = `memorilo-network-paste-${Date.now()}-${pasteSequence++}`
  return url.toString()
}

function mapNetworkImages(
  node: ProseMirrorNode,
  replacements: Map<string, string>,
): ProseMirrorNode {
  if (node.type.name === 'image') {
    const source = typeof node.attrs.src === 'string' ? networkImageUrl(node.attrs.src) : null
    if (source) {
      let temporarySource = replacements.get(source)
      if (!temporarySource) {
        temporarySource = temporaryImageSource(source)
        replacements.set(source, temporarySource)
      }
      return node.type.create({ ...node.attrs, src: temporarySource }, node.content, node.marks)
    }
  }
  if (node.isLeaf)
    return node
  const children: ProseMirrorNode[] = []
  node.content.forEach(child => children.push(mapNetworkImages(child, replacements)))
  return node.copy(Fragment.fromArray(children))
}

function prepareNetworkImageSlice(slice: Slice): {
  replacements: ReadonlyMap<string, string>
  slice: Slice
} {
  const replacements = new Map<string, string>()
  const children: ProseMirrorNode[] = []
  slice.content.forEach(child => children.push(mapNetworkImages(child, replacements)))
  return {
    replacements,
    slice: new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd),
  }
}

type ApplyReplacement = (temporarySource: string, completedSource: string) => void

export class NetworkImagePasteRuntime {
  readonly #adapters: EditorAdapters
  readonly #completedReplacements = new Map<string, string>()
  readonly #imports = createOperationSupervisor('Network image paste', {
    concurrency: 'unbounded',
  })

  constructor(adapters: EditorAdapters) {
    this.#adapters = adapters
  }

  get closed() {
    return this.#imports.isClosed()
  }

  startImport(source: string, temporarySource: string, applyReplacement: ApplyReplacement) {
    if (this.#imports.isClosed())
      return false
    const operation = this.#imports.run(async () => {
      try {
        const storedSource = await this.#import(source)
        this.#complete(temporarySource, storedSource, applyReplacement)
      }
      catch (error) {
        if (this.#imports.isClosed())
          return
        this.#complete(temporarySource, source, applyReplacement)
        console.error(`Failed to download pasted image ${source}`, error)
      }
    })
    void operation.then(
      () => undefined,
      () => undefined,
    )
    return true
  }

  applyCompletedReplacements(applyReplacement: ApplyReplacement) {
    if (this.#imports.isClosed())
      return
    for (const [temporarySource, completedSource] of this.#completedReplacements)
      this.#apply(temporarySource, completedSource, applyReplacement)
  }

  close() {
    if (!this.#imports.isClosed()) {
      this.#completedReplacements.clear()
    }
    return this.#imports.close()
  }

  #import(source: string) {
    return this.#adapters.importNetworkImage
      ? this.#adapters.importNetworkImage(source)
      : Promise.reject(new Error('Network image import is unavailable'))
  }

  #complete(temporarySource: string, completedSource: string, applyReplacement: ApplyReplacement) {
    if (this.#imports.isClosed())
      return
    this.#completedReplacements.set(temporarySource, completedSource)
    this.#apply(temporarySource, completedSource, applyReplacement)
  }

  #apply(temporarySource: string, completedSource: string, applyReplacement: ApplyReplacement) {
    try {
      applyReplacement(temporarySource, completedSource)
    }
    catch (error) {
      console.error(`Failed to replace pasted image ${temporarySource}`, error)
    }
  }
}

export function createNetworkImagePaste(adapters: EditorAdapters) {
  const runtime = new NetworkImagePasteRuntime(adapters)
  const applyCompletedReplacements: Parameters<typeof defineUpdateHandler>[0] = (view) => {
    runtime.applyCompletedReplacements((temporarySource, completedSource) => {
      replaceImageURL(view, temporarySource, completedSource)
    })
  }
  const replaceAfterImport = (
    source: string,
    temporarySource: string,
    view: Parameters<Parameters<typeof definePasteHandler>[0]>[0],
  ): void => {
    runtime.startImport(source, temporarySource, (pendingSource, storedSource) => {
      replaceImageURL(view, pendingSource, storedSource)
    })
  }

  const extension = union(definePasteHandler((view, event, slice) => {
    if (runtime.closed)
      return false
    if (adapters.networkImagePasteBehavior !== 'download' && adapters.networkImagePasteBehavior !== 'url')
      return false
    const clipboardData = event.clipboardData
    if (!clipboardData || [...clipboardData.files].some(file => file.type.startsWith('image/')))
      return false

    const shouldDownload = adapters.networkImagePasteBehavior === 'download'
    if (clipboardData.getData('text/html').length > 0) {
      if (!shouldDownload)
        return false
      const prepared = prepareNetworkImageSlice(slice)
      if (prepared.replacements.size === 0)
        return false
      view.dispatch(
        view.state.tr
          .replaceSelection(prepared.slice)
          .scrollIntoView()
          .setMeta('paste', true)
          .setMeta('uiEvent', 'paste'),
      )
      for (const [source, temporarySource] of prepared.replacements)
        replaceAfterImport(source, temporarySource, view)
      return true
    }

    const source = networkImageUrl(clipboardData.getData('text/plain'))
    if (!source)
      return false
    const temporarySource = shouldDownload ? temporaryImageSource(source) : source
    const inserted = insertImage({ src: temporarySource })(view.state, view.dispatch, view)
    if (!inserted)
      return false
    if (shouldDownload)
      replaceAfterImport(source, temporarySource, view)
    return true
  }), defineUpdateHandler(applyCompletedReplacements))

  return { extension, runtime }
}
