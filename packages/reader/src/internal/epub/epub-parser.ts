import type { ResolvedReaderSource } from '../source'
import { combineLifecycleFailures } from '@memorilo/effect-lifecycle'
import {
  Layout,
  Link,
  Links,
  LocalizedString,
  Locator,
  LocatorLocations,
  Manifest,
  Metadata,
  Profile,
  Properties,
  Publication,
  ReadingProgression,
} from '@readium/shared'
import { EpubArchive } from './epub-archive'
import {
  epubMediaTypeForPath,
  normalizeEpubPath,
  resolveEpubPath,
} from './epub-resource-content'

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

function splitReference(reference: string): { path: string, suffix: string } {
  const queryIndex = reference.indexOf('?')
  const fragmentIndex = reference.indexOf('#')
  const indexes = [queryIndex, fragmentIndex].filter(index => index >= 0)
  const separator = indexes.length > 0 ? Math.min(...indexes) : -1
  return separator < 0
    ? { path: reference, suffix: '' }
    : { path: reference.slice(0, separator), suffix: reference.slice(separator) }
}

function resolveNavigationHref(basePath: string, reference: string): string {
  const { path, suffix } = splitReference(reference.trim())
  if (!path)
    return `${normalizeEpubPath(basePath)}${suffix}`
  return `${resolveEpubPath(basePath, path)}${suffix}`
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
      type: epubMediaTypeForPath(normalizeEpubPath(resolvedHref)),
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
      type: epubMediaTypeForPath(normalizeEpubPath(href)),
    })]
  })

  return parsePoints(navigationMap)
}

async function parseTableOfContents(
  archive: EpubArchive,
  manifestItems: ReadonlyMap<string, ManifestItem>,
  spineElement: Element,
  signal?: AbortSignal,
): Promise<Link[]> {
  const navigationItem = [...manifestItems.values()].find(item => item.properties.has('nav'))
  if (navigationItem) {
    const document = parseXml(await archive.readText(navigationItem.href), 'EPUB navigation document')
    signal?.throwIfAborted()
    const links = navigationDocumentLinks(document, navigationItem.href)
    if (links.length > 0)
      return links
  }

  const ncxId = spineElement.getAttribute('toc')
  const ncxItem = ncxId ? manifestItems.get(ncxId) : undefined
  if (!ncxItem)
    return []
  const document = parseXml(await archive.readText(ncxItem.href), 'EPUB NCX document')
  signal?.throwIfAborted()
  return ncxLinks(document, ncxItem.href)
}

export async function parseEpub(
  source: ResolvedReaderSource,
  signal?: AbortSignal,
): Promise<ParsedEpub> {
  const archive = await EpubArchive.open(source, signal)
  try {
    signal?.throwIfAborted()
    const mimetype = (await archive.readText('mimetype')).trim()
    signal?.throwIfAborted()
    if (mimetype !== 'application/epub+zip')
      throw new Error('File is not a valid EPUB container')

    const containerDocument = parseXml(await archive.readText('META-INF/container.xml'), 'EPUB container')
    signal?.throwIfAborted()
    const rootfile = firstElement(containerDocument, 'rootfile')
    const packagePath = normalizeEpubPath(rootfile.getAttribute('full-path') ?? '')
    if (!packagePath)
      throw new Error('EPUB container does not identify a package document')

    const packageDocument = parseXml(await archive.readText(packagePath), 'EPUB package document')
    signal?.throwIfAborted()
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
        href: resolveEpubPath(packagePath, href),
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
    const tableOfContents = await parseTableOfContents(archive, manifestItems, spineElement, signal)
    signal?.throwIfAborted()
    const allLinks = [...readingOrder, ...resources]
    archive.registerLinks(allLinks)

    const readingProgression = spineElement.getAttribute('page-progression-direction') === 'rtl'
      ? ReadingProgression.rtl
      : ReadingProgression.ltr
    const metadata = new Metadata({
      conformsTo: [Profile.EPUB],
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
    try {
      await archive.close()
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [error, cleanupError],
        'Failed to parse and close EPUB archive',
      )
    }
    throw error
  }
}
