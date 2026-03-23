import type {
  BaseImageAttributes,
  ClipboardFileImageSource,
  ClipboardImageSource,
} from './types'

function parseImageDimension(rawValue: string | null) {
  if (rawValue === null || rawValue.trim().length === 0) {
    return null
  }

  const value = Number(rawValue)
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }

  return value
}

function readImageAttributes(element: HTMLImageElement): BaseImageAttributes {
  return {
    alt: element.getAttribute('alt'),
    title: element.getAttribute('title'),
    width: parseImageDimension(element.getAttribute('width')),
    height: parseImageDimension(element.getAttribute('height')),
  }
}

function isImageOnlyHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(doc.querySelectorAll('img[src]'))
  if (images.length === 0) {
    return false
  }

  doc.body.querySelectorAll('img').forEach((node) => {
    node.remove()
  })

  const remainingText = doc.body.textContent
  return remainingText === null || remainingText.trim().length === 0
}

function normalizeFileUrlPath(url: URL) {
  if (url.host.length > 0 && url.host !== 'localhost') {
    throw new Error(`Unsupported file host: ${url.host}`)
  }

  const decodedPath = decodeURIComponent(url.pathname)
  if (/^\/[A-Z]:/i.test(decodedPath)) {
    return decodedPath.slice(1)
  }

  return decodedPath
}

function readHtmlImageSource(element: HTMLImageElement): ClipboardImageSource {
  const src = element.getAttribute('src')
  if (src === null || src.trim().length === 0) {
    throw new Error('Pasted image is missing src')
  }

  const attributes = readImageAttributes(element)
  const assetId = element.getAttribute('data-asset-id')
  if (assetId !== null && assetId.trim().length > 0) {
    return {
      kind: 'existing-asset',
      assetId,
      src,
      ...attributes,
    }
  }

  if (src.startsWith('data:')) {
    return {
      kind: 'data-url',
      dataUrl: src,
      ...attributes,
    }
  }

  const url = new URL(src, window.location.href)
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    return {
      kind: 'remote-url',
      url: url.toString(),
      ...attributes,
    }
  }

  if (url.protocol === 'blob:') {
    return {
      kind: 'blob-url',
      url: url.toString(),
      ...attributes,
    }
  }

  if (url.protocol === 'file:') {
    return {
      kind: 'file-path',
      path: normalizeFileUrlPath(url),
      url: url.toString(),
      ...attributes,
    }
  }

  throw new Error(`Unsupported pasted image source: ${url.protocol}`)
}

function getClipboardHtmlImageSources(clipboardData: DataTransfer): ClipboardImageSource[] {
  const html = clipboardData.getData('text/html')
  if (html.trim().length === 0 || !isImageOnlyHtml(html)) {
    return []
  }

  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll<HTMLImageElement>('img[src]')).map(image => readHtmlImageSource(image))
}

function getClipboardFileImageSources(clipboardData: DataTransfer): ClipboardImageSource[] {
  return Array.from(clipboardData.files)
    .filter(file => file.type.startsWith('image/'))
    .map((file): ClipboardFileImageSource => ({
      kind: 'clipboard-file',
      file,
      alt: null,
      title: null,
      width: null,
      height: null,
    }))
}

export function getClipboardImageSources(clipboardData: DataTransfer) {
  const htmlSources = getClipboardHtmlImageSources(clipboardData)
  if (htmlSources.length > 0) {
    return htmlSources
  }

  return getClipboardFileImageSources(clipboardData)
}
