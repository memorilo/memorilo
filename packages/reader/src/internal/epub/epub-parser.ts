import type { Fetcher, NumberRange } from '@readium/shared'
import type { Entry, FileEntry } from '@zip.js/zip.js'
import {
  Layout,
  Link,
  Links,
  LocalizedString,
  Locator,
  LocatorLocations,
  Manifest,
  Metadata,
  Properties,
  Publication,
  ReadingProgression,
  Resource,
} from '@readium/shared'
import {
  BlobReader,
  Uint8ArrayWriter,
  ZipReader,
} from '@zip.js/zip.js'

export type EpubLayoutKind = 'fixed' | 'mixed' | 'reflowable'

export interface ParsedEpub {
  archive: EpubArchive
  layout: EpubLayoutKind
  positions: Locator[]
  publication: Publication
  title: string
}

interface ManifestItem {
  href: string
  id: string
  mediaType: string
  properties: Set<string>
}

const maximumEntryCount = 20_000
const maximumEntrySize = 128 * 1024 * 1024
const maximumExpandedSize = 512 * 1024 * 1024
const textDecoder = new TextDecoder()
const textEncoder = new TextEncoder()

function parseXml(value: string, label: string): XMLDocument {
  const document = new DOMParser().parseFromString(value, 'application/xml')
  const parseError = document.querySelector('parsererror')
  if (parseError)
    throw new Error(`Invalid ${label}: ${parseError.textContent?.trim() || 'XML parsing failed'}`)
  return document
}

function childElements(parent: ParentNode, localName: string): Element[] {
  return Array.from(parent.querySelectorAll('*')).filter(element => element.localName === localName)
}

function directChildElements(parent: ParentNode, localName: string): Element[] {
  return Array.from(parent.children).filter(element => element.localName === localName)
}

function firstElement(parent: ParentNode, localName: string): Element {
  const element = childElements(parent, localName)[0]
  if (!element)
    throw new Error(`EPUB is missing ${localName}`)
  return element
}

function normalizePath(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? ''
  const decoded = decodeURIComponent(withoutQuery).replaceAll('\\', '/')
  const segments: string[] = []
  for (const segment of decoded.split('/')) {
    if (!segment || segment === '.')
      continue
    if (segment === '..') {
      if (segments.length === 0)
        throw new Error(`EPUB resource escapes its container: ${path}`)
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return segments.join('/')
}

function directoryName(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator < 0 ? '' : path.slice(0, separator + 1)
}

function resolvePath(basePath: string, reference: string): string {
  return normalizePath(`${directoryName(basePath)}${reference}`)
}

function resolveNavigationHref(basePath: string, reference: string): string {
  const { path, suffix } = splitReference(reference.trim())
  if (!path)
    return `${normalizePath(basePath)}${suffix}`
  return `${resolvePath(basePath, path)}${suffix}`
}

function isRemoteReference(reference: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference.trim())
}

function splitReference(reference: string): { path: string, suffix: string } {
  const queryIndex = reference.indexOf('?')
  const fragmentIndex = reference.indexOf('#')
  const indexes = [queryIndex, fragmentIndex].filter(index => index >= 0)
  const separator = indexes.length > 0 ? Math.min(...indexes) : -1
  return separator < 0
    ? { path: reference, suffix: '' }
    : { path: reference.slice(0, separator), suffix: reference.slice(separator) }
}

function mediaTypeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase()
  const mediaTypes: Record<string, string> = {
    avif: 'image/avif',
    css: 'text/css',
    gif: 'image/gif',
    html: 'text/html',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    js: 'text/javascript',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    ncx: 'application/x-dtbncx+xml',
    otf: 'font/otf',
    png: 'image/png',
    svg: 'image/svg+xml',
    ttf: 'font/ttf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    xhtml: 'application/xhtml+xml',
    xml: 'application/xml',
  }
  return extension ? (mediaTypes[extension] ?? 'application/octet-stream') : 'application/octet-stream'
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

class EpubResource extends Resource {
  constructor(
    private readonly archive: EpubArchive,
    private readonly resourceLink: Link,
    private readonly path: string,
  ) {
    super()
  }

  async link() {
    return this.resourceLink
  }

  async length() {
    return this.archive.sizeOf(this.path)
  }

  async read(range?: NumberRange) {
    const bytes = await this.archive.readResource(this.path, this.resourceLink.type)
    if (!range)
      return bytes.slice()
    return bytes.slice(range.start, range.endInclusive + 1)
  }

  close() {}
}

export class EpubArchive implements Fetcher {
  private closed = false
  private readonly entries = new Map<string, FileEntry>()
  private readonly linksByPath = new Map<string, Link>()
  private readonly objectUrlPromises = new Map<string, Promise<string>>()
  private readonly objectUrls = new Set<string>()
  private readonly rewrittenBytes = new Map<string, Promise<Uint8Array>>()

  private constructor(private readonly zipReader: ZipReader<Blob>) {}

  static async open(bytes: Uint8Array): Promise<EpubArchive> {
    const zipReader = new ZipReader(new BlobReader(new Blob([asArrayBuffer(bytes)], { type: 'application/epub+zip' })))
    const archive = new EpubArchive(zipReader)
    await archive.indexEntries(await zipReader.getEntries())
    return archive
  }

  registerLinks(links: Link[]) {
    for (const link of links)
      this.linksByPath.set(normalizePath(link.href), link)
  }

  links() {
    return [...this.linksByPath.values()]
  }

  get(link: Link) {
    const path = normalizePath(link.href)
    if (!this.entries.has(path))
      throw new Error(`EPUB resource not found: ${link.href}`)
    return new EpubResource(this, link, path)
  }

  sizeOf(path: string) {
    return this.requireEntry(path).uncompressedSize
  }

  async readText(path: string) {
    return textDecoder.decode(await this.readEntry(path))
  }

  async readResource(path: string, declaredMediaType?: string) {
    this.ensureOpen()
    const normalized = normalizePath(path)
    const mediaType = declaredMediaType || mediaTypeForPath(normalized)
    if (mediaType === 'text/css')
      return this.cachedRewrite(normalized, () => this.rewriteCss(normalized))
    if (mediaType === 'application/xhtml+xml' || mediaType === 'text/html')
      return this.cachedRewrite(normalized, () => this.rewriteHtml(normalized, mediaType))
    return this.readEntry(normalized)
  }

  async close() {
    if (this.closed)
      return
    this.closed = true
    for (const url of this.objectUrls)
      URL.revokeObjectURL(url)
    this.objectUrls.clear()
    this.objectUrlPromises.clear()
    this.rewrittenBytes.clear()
    await this.zipReader.close()
  }

  private async indexEntries(entries: Entry[]) {
    if (entries.length > maximumEntryCount)
      throw new Error(`EPUB contains too many files (${entries.length})`)
    let expandedSize = 0
    for (const entry of entries) {
      if (entry.directory)
        continue
      if (entry.encrypted)
        throw new Error('Encrypted or DRM-protected EPUB files are not supported')
      if (entry.uncompressedSize > maximumEntrySize)
        throw new Error(`EPUB resource is too large: ${entry.filename}`)
      expandedSize += entry.uncompressedSize
      if (expandedSize > maximumExpandedSize)
        throw new Error('EPUB expands beyond the supported size limit')
      const path = normalizePath(entry.filename)
      if (this.entries.has(path))
        throw new Error(`EPUB contains a duplicate resource: ${path}`)
      this.entries.set(path, entry)
    }
  }

  private cachedRewrite(path: string, rewrite: () => Promise<Uint8Array>) {
    const existing = this.rewrittenBytes.get(path)
    if (existing)
      return existing
    const pending = rewrite()
    this.rewrittenBytes.set(path, pending)
    return pending
  }

  private async readEntry(path: string) {
    this.ensureOpen()
    return this.requireEntry(path).getData(new Uint8ArrayWriter())
  }

  private requireEntry(path: string) {
    const normalized = normalizePath(path)
    const entry = this.entries.get(normalized)
    if (!entry)
      throw new Error(`EPUB resource not found: ${normalized}`)
    return entry
  }

  private ensureOpen() {
    if (this.closed)
      throw new Error('EPUB archive is closed')
  }

  private async objectUrl(path: string, stack: ReadonlySet<string> = new Set()) {
    const normalized = normalizePath(path)
    if (stack.has(normalized))
      return 'about:blank'
    const existing = this.objectUrlPromises.get(normalized)
    if (existing)
      return existing

    const nextStack = new Set(stack)
    nextStack.add(normalized)
    const pending = (async () => {
      const mediaType = this.linksByPath.get(normalized)?.type || mediaTypeForPath(normalized)
      const bytes = mediaType === 'text/css'
        ? await this.rewriteCss(normalized, nextStack)
        : mediaType === 'application/xhtml+xml' || mediaType === 'text/html'
          ? await this.rewriteHtml(normalized, mediaType, nextStack)
          : await this.readEntry(normalized)
      const url = URL.createObjectURL(new Blob([asArrayBuffer(bytes)], { type: mediaType }))
      this.objectUrls.add(url)
      return url
    })()
    this.objectUrlPromises.set(normalized, pending)
    return pending
  }

  private async rewriteReference(basePath: string, reference: string, stack: ReadonlySet<string>) {
    const trimmed = reference.trim()
    if (!trimmed || isRemoteReference(trimmed))
      return trimmed
    const { path, suffix } = splitReference(trimmed)
    const resolved = resolvePath(basePath, path)
    if (!this.entries.has(resolved))
      return trimmed
    return `${await this.objectUrl(resolved, stack)}${suffix}`
  }

  private async rewriteCss(path: string, stack: ReadonlySet<string> = new Set()) {
    let css = await this.readText(path)
    css = await replaceAsync(css, /url\(([^)]*)\)/gi, async (match) => {
      const reference = unquoteCssReference(match[1])
      if (reference === undefined)
        return match[0]
      const rewritten = await this.rewriteReference(path, reference, stack)
      return `url("${rewritten.replaceAll('"', '%22')}")`
    })
    css = await replaceAsync(css, /@import\s+(['"])(.*?)\1/gi, async (match) => {
      const reference = match[2]
      if (reference === undefined)
        return match[0]
      const rewritten = await this.rewriteReference(path, reference, stack)
      return `@import "${rewritten.replaceAll('"', '%22')}"`
    })
    return textEncoder.encode(css)
  }

  private async rewriteHtml(path: string, mediaType: string, stack: ReadonlySet<string> = new Set()) {
    const raw = await this.readText(path)
    const parserType = mediaType === 'text/html' ? 'text/html' : 'application/xhtml+xml'
    const document = new DOMParser().parseFromString(raw, parserType)
    const parseError = document.querySelector('parsererror')
    if (parseError)
      throw new Error(`Invalid EPUB content document ${path}`)

    document.querySelectorAll('script, meta[http-equiv="refresh" i]').forEach(element => element.remove())
    for (const element of Array.from(document.querySelectorAll('*'))) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.toLowerCase().startsWith('on'))
          element.removeAttribute(attribute.name)
      }
    }

    const targets: Array<{ attribute: string, selector: string }> = [
      { attribute: 'src', selector: 'audio[src], embed[src], iframe[src], img[src], input[src], source[src], track[src], video[src]' },
      { attribute: 'poster', selector: 'video[poster]' },
      { attribute: 'data', selector: 'object[data]' },
      { attribute: 'href', selector: 'image[href], use[href]' },
      { attribute: 'xlink:href', selector: '[xlink\\:href]' },
    ]
    for (const target of targets) {
      for (const element of Array.from(document.querySelectorAll(target.selector))) {
        const value = element.getAttribute(target.attribute)
        if (!value)
          continue
        if (/^javascript:/i.test(value.trim())) {
          element.removeAttribute(target.attribute)
          continue
        }
        element.setAttribute(target.attribute, await this.rewriteReference(path, value, stack))
      }
    }

    for (const element of Array.from(document.querySelectorAll('link[href]'))) {
      const relation = element.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? []
      if (!relation.includes('stylesheet'))
        continue
      const href = element.getAttribute('href')
      if (href)
        element.setAttribute('href', await this.rewriteReference(path, href, stack))
    }

    for (const element of Array.from(document.querySelectorAll('[srcset]'))) {
      const srcset = element.getAttribute('srcset')
      if (!srcset)
        continue
      const candidates = await Promise.all(srcset.split(',').map(async (candidate) => {
        const [reference, ...descriptor] = candidate.trim().split(/\s+/)
        if (!reference)
          return candidate
        const rewritten = await this.rewriteReference(path, reference, stack)
        return [rewritten, ...descriptor].join(' ')
      }))
      element.setAttribute('srcset', candidates.join(', '))
    }

    for (const element of Array.from(document.querySelectorAll('[style]'))) {
      const style = element.getAttribute('style')
      if (style)
        element.setAttribute('style', textDecoder.decode(await this.rewriteInlineCss(path, style, stack)))
    }
    for (const element of Array.from(document.querySelectorAll('style'))) {
      element.textContent = textDecoder.decode(await this.rewriteInlineCss(path, element.textContent ?? '', stack))
    }

    return textEncoder.encode(new XMLSerializer().serializeToString(document))
  }

  private async rewriteInlineCss(path: string, css: string, stack: ReadonlySet<string>) {
    const rewritten = await replaceAsync(css, /url\(([^)]*)\)/gi, async (match) => {
      const reference = unquoteCssReference(match[1])
      if (reference === undefined)
        return match[0]
      const next = await this.rewriteReference(path, reference, stack)
      return `url("${next.replaceAll('"', '%22')}")`
    })
    return textEncoder.encode(rewritten)
  }
}

function unquoteCssReference(value: string | undefined) {
  if (value === undefined)
    return undefined
  const trimmed = value.trim()
  const first = trimmed[0]
  const last = trimmed.at(-1)
  return (first === '"' && last === '"') || (first === '\'' && last === '\'')
    ? trimmed.slice(1, -1)
    : trimmed
}

async function replaceAsync(
  input: string,
  expression: RegExp,
  replacer: (match: RegExpExecArray) => Promise<string>,
) {
  const matches = [...input.matchAll(expression)]
  if (matches.length === 0)
    return input
  const replacements = await Promise.all(matches.map(match => replacer(match)))
  let result = ''
  let cursor = 0
  matches.forEach((match, index) => {
    const at = match.index ?? 0
    result += input.slice(cursor, at)
    result += replacements[index]
    cursor = at + match[0].length
  })
  return result + input.slice(cursor)
}

function parseLayout(tokens: Set<string>, fallback: Layout): Layout {
  if (tokens.has('rendition:layout-pre-paginated'))
    return Layout.fixed
  if (tokens.has('rendition:layout-reflowable'))
    return Layout.reflowable
  return fallback
}

function normalizedLabel(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function directChildWithName(parent: ParentNode, localName: string): Element | undefined {
  return directChildElements(parent, localName)[0]
}

function navigationDocumentLinks(document: XMLDocument, documentPath: string): Link[] {
  const navigation = childElements(document, 'nav').find((element) => {
    const type = element.getAttribute('epub:type')
      ?? element.getAttributeNS('http://www.idpf.org/2007/ops', 'type')
      ?? ''
    return type.split(/\s+/).includes('toc') || element.getAttribute('role') === 'doc-toc'
  })
  if (!navigation)
    return []

  const list = directChildWithName(navigation, 'ol')
  if (!list)
    return []

  const parseList = (orderedList: Element): Link[] => directChildElements(orderedList, 'li').flatMap((item) => {
    const target = directChildWithName(item, 'a') ?? directChildWithName(item, 'span')
    const childList = directChildWithName(item, 'ol')
    const children = childList ? parseList(childList) : []
    const label = target ? normalizedLabel(target) : ''
    const href = target?.getAttribute('href')
    if (!label)
      return children
    const resolvedHref = href
      ? resolveNavigationHref(documentPath, href)
      : children[0]?.href
    if (!resolvedHref)
      return []
    return [new Link({
      children: children.length > 0 ? new Links(children) : undefined,
      href: resolvedHref,
      title: label,
      type: mediaTypeForPath(normalizePath(resolvedHref)),
    })]
  })

  return parseList(list)
}

function ncxLinks(document: XMLDocument, documentPath: string): Link[] {
  const navigationMap = childElements(document, 'navMap')[0]
  if (!navigationMap)
    return []

  const parsePoints = (parent: Element): Link[] => directChildElements(parent, 'navPoint').flatMap((point) => {
    const labelElement = directChildWithName(point, 'navLabel')
    const textElement = labelElement ? childElements(labelElement, 'text')[0] : undefined
    const content = directChildWithName(point, 'content')
    const source = content?.getAttribute('src')
    const children = parsePoints(point)
    const label = textElement ? normalizedLabel(textElement) : ''
    if (!label || !source)
      return children
    const href = resolveNavigationHref(documentPath, source)
    return [new Link({
      children: children.length > 0 ? new Links(children) : undefined,
      href,
      title: label,
      type: mediaTypeForPath(normalizePath(href)),
    })]
  })

  return parsePoints(navigationMap)
}

async function parseTableOfContents(
  archive: EpubArchive,
  manifestItems: ReadonlyMap<string, ManifestItem>,
  spineElement: Element,
): Promise<Link[]> {
  const navigationItem = [...manifestItems.values()].find(item => item.properties.has('nav'))
  if (navigationItem) {
    const document = parseXml(await archive.readText(navigationItem.href), 'EPUB navigation document')
    const links = navigationDocumentLinks(document, navigationItem.href)
    if (links.length > 0)
      return links
  }

  const ncxId = spineElement.getAttribute('toc')
  const ncxItem = ncxId ? manifestItems.get(ncxId) : undefined
  if (!ncxItem)
    return []
  const document = parseXml(await archive.readText(ncxItem.href), 'EPUB NCX document')
  return ncxLinks(document, ncxItem.href)
}

export async function parseEpub(bytes: Uint8Array): Promise<ParsedEpub> {
  const archive = await EpubArchive.open(bytes)
  try {
    const mimetype = (await archive.readText('mimetype')).trim()
    if (mimetype !== 'application/epub+zip')
      throw new Error('File is not a valid EPUB container')

    const containerDocument = parseXml(await archive.readText('META-INF/container.xml'), 'EPUB container')
    const rootfile = firstElement(containerDocument, 'rootfile')
    const packagePath = normalizePath(rootfile.getAttribute('full-path') ?? '')
    if (!packagePath)
      throw new Error('EPUB container does not identify a package document')

    const packageDocument = parseXml(await archive.readText(packagePath), 'EPUB package document')
    const metadataElement = firstElement(packageDocument, 'metadata')
    const manifestElement = firstElement(packageDocument, 'manifest')
    const spineElement = firstElement(packageDocument, 'spine')

    const title = childElements(metadataElement, 'title')[0]?.textContent?.trim() || 'Untitled publication'
    const identifier = childElements(metadataElement, 'identifier')[0]?.textContent?.trim()
    const languages = childElements(metadataElement, 'language')
      .map(element => element.textContent?.trim())
      .filter((value): value is string => Boolean(value))
    const packageLayoutValue = childElements(metadataElement, 'meta')
      .find(element => element.getAttribute('property') === 'rendition:layout')
      ?.textContent
      ?.trim()
    const packageLayout = packageLayoutValue === 'pre-paginated' ? Layout.fixed : Layout.reflowable

    const manifestItems = new Map<string, ManifestItem>()
    for (const item of childElements(manifestElement, 'item')) {
      const id = item.getAttribute('id')
      const href = item.getAttribute('href')
      const mediaType = item.getAttribute('media-type')
      if (!id || !href || !mediaType)
        throw new Error('EPUB manifest item is missing id, href, or media-type')
      manifestItems.set(id, {
        href: resolvePath(packagePath, href),
        id,
        mediaType,
        properties: new Set((item.getAttribute('properties') ?? '').split(/\s+/).filter(Boolean)),
      })
    }

    const readingOrder: Link[] = []
    const spineLayouts: Layout[] = []
    for (const itemref of childElements(spineElement, 'itemref')) {
      const idref = itemref.getAttribute('idref')
      const item = idref ? manifestItems.get(idref) : undefined
      if (!item)
        throw new Error(`EPUB spine references an unknown manifest item: ${idref ?? '(missing)'}`)
      const tokens = new Set([
        ...item.properties,
        ...(itemref.getAttribute('properties') ?? '').split(/\s+/).filter(Boolean),
      ])
      const itemLayout = parseLayout(tokens, packageLayout)
      spineLayouts.push(itemLayout)
      readingOrder.push(new Link({
        href: item.href,
        properties: new Properties({ layout: itemLayout }),
        type: item.mediaType,
      }))
    }
    if (readingOrder.length === 0)
      throw new Error('EPUB spine is empty')

    const hasFixed = spineLayouts.includes(Layout.fixed)
    const hasReflowable = spineLayouts.includes(Layout.reflowable)
    const layout: EpubLayoutKind = hasFixed && hasReflowable ? 'mixed' : hasFixed ? 'fixed' : 'reflowable'
    const navigatorLayout = hasFixed ? Layout.fixed : Layout.reflowable

    const resources = [...manifestItems.values()]
      .filter(item => !readingOrder.some(link => link.href === item.href))
      .map(item => new Link({
        href: item.href,
        rels: item.properties.has('cover-image') ? new Set(['cover']) : undefined,
        type: item.mediaType,
      }))
    const tableOfContents = await parseTableOfContents(archive, manifestItems, spineElement)
    const allLinks = [...readingOrder, ...resources]
    archive.registerLinks(allLinks)

    const readingProgression = spineElement.getAttribute('page-progression-direction') === 'rtl'
      ? ReadingProgression.rtl
      : ReadingProgression.ltr
    const metadata = new Metadata({
      identifier,
      languages: languages.length > 0 ? languages : undefined,
      layout: navigatorLayout,
      readingProgression,
      title: new LocalizedString(title),
    })
    const manifest = new Manifest({
      links: new Links([]),
      metadata,
      readingOrder: new Links(readingOrder),
      resources: new Links(resources),
      toc: tableOfContents.length > 0 ? new Links(tableOfContents) : undefined,
    })
    manifest.setSelfLink(`https://memorilo-reader.invalid/${crypto.randomUUID()}/manifest.json`)
    const publication = new Publication({ fetcher: archive, manifest })
    const positions = readingOrder.map((link, index) => new Locator({
      href: link.href,
      locations: new LocatorLocations({
        position: index + 1,
        progression: 0,
        totalProgression: readingOrder.length <= 1 ? 1 : index / (readingOrder.length - 1),
      }),
      type: link.type ?? 'application/xhtml+xml',
    }))

    return { archive, layout, positions, publication, title }
  }
  catch (error) {
    await archive.close()
    throw error
  }
}
