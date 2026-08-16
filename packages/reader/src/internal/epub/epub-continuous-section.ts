import type { Link } from '@readium/shared'
import type { ReaderPresentationMode } from '../../types'
import { Layout } from '@readium/shared'
import { normalizeEpubPath } from './epub-resource-content'

export interface ContinuousEpubSection {
  annotationLayer: HTMLDivElement
  content: HTMLElement
  fixed: boolean
  href: string
  link: Link
  naturalHeight: number
  naturalWidth: number
  root: HTMLElement
  type: string
}

function parserType(mediaType: string): DOMParserSupportedType {
  return mediaType === 'text/html' ? 'text/html' : 'application/xhtml+xml'
}

function viewportSize(document: Document): { height: number, width: number } {
  const value = document.querySelector('meta[name="viewport" i]')?.getAttribute('content') ?? ''
  const width = /(?:^|,)\s*width\s*=\s*([\d.]+)/i.exec(value)?.[1]
  const height = /(?:^|,)\s*height\s*=\s*([\d.]+)/i.exec(value)?.[1]
  const parsedWidth = Number(width)
  const parsedHeight = Number(height)
  return {
    height: Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 768,
    width: Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 1024,
  }
}

export function appendContinuousEpubSection(
  frameDocument: Document,
  link: Link,
  type: string,
  bytes: Uint8Array,
  fixedLayout: boolean,
): ContinuousEpubSection {
  const source = new DOMParser().parseFromString(new TextDecoder().decode(bytes), parserType(type))
  if (source.querySelector('parsererror'))
    throw new Error(`Invalid EPUB content document ${link.href}`)
  const fixed = fixedLayout || link.properties?.otherProperties.layout === Layout.fixed
  const size = viewportSize(source)
  const root = frameDocument.createElement('section')
  root.className = 'memorilo-epub-section'
  root.dataset.href = normalizeEpubPath(link.href)
  const content = frameDocument.createElement('div')
  content.className = 'memorilo-epub-content'
  content.dataset.href = normalizeEpubPath(link.href)
  const sourceBody = source.body ?? source.documentElement
  content.classList.add(...sourceBody.classList)
  const bodyStyle = sourceBody.getAttribute('style')
  if (bodyStyle)
    content.style.cssText += bodyStyle
  for (const child of [...sourceBody.childNodes])
    content.append(frameDocument.importNode(child, true))
  for (const stylesheet of [...source.querySelectorAll('style, link[rel~="stylesheet" i]')])
    root.prepend(frameDocument.importNode(stylesheet, true))
  const annotationLayer = frameDocument.createElement('div')
  annotationLayer.className = 'memorilo-epub-annotations'
  root.append(content, annotationLayer)
  frameDocument.body.append(root)
  return {
    annotationLayer,
    content,
    fixed,
    href: normalizeEpubPath(link.href),
    link,
    naturalHeight: size.height,
    naturalWidth: size.width,
    root,
    type,
  }
}

export function layoutContinuousEpubSection(
  section: ContinuousEpubSection,
  options: {
    availableWidth: number
    presentationMode: ReaderPresentationMode
    scale: number
  },
): void {
  if (section.fixed) {
    const fitScale = Math.min(1, Math.max(1, options.availableWidth - 48) / section.naturalWidth)
    const scale = fitScale * options.scale
    section.content.style.width = `${section.naturalWidth}px`
    section.content.style.height = `${section.naturalHeight}px`
    section.content.style.transform = `scale(${scale})`
    section.content.style.transformOrigin = '0 0'
    section.root.style.width = `${Math.max(1, Math.round(section.naturalWidth * scale))}px`
    section.root.style.height = `${Math.max(1, Math.round(section.naturalHeight * scale))}px`
    section.root.style.padding = '0'
    section.root.style.overflow = 'hidden'
    return
  }
  const fontScale = options.presentationMode === 'reader' ? options.scale : 1
  section.content.style.fontSize = `${fontScale}em`
  section.content.style.lineHeight = options.presentationMode === 'reader' ? '1.5' : ''
  section.content.style.maxWidth = options.presentationMode === 'reader' ? '72ch' : 'none'
  section.content.style.margin = '0 auto'
  section.root.style.width = 'min(100%, 960px)'
  section.root.style.height = 'auto'
  section.root.style.padding = '48px clamp(24px, 6vw, 72px)'
  section.root.style.overflow = 'visible'
}
