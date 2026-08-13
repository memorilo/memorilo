import type { AnkiConnectClient } from './client'
import type { AnkiCardMedia, AnkiConnectError, AnkiMediaFile, AnkiRenderableCard } from './model'
import { Effect } from 'effect'
import { AnkiConnectProtocolError } from './model'

const cssUrlPattern = /url\(([^)]*)\)/giu
const cssImportPattern = /@import\s+(?:url\(([^)]*)\)|(['"])([^'"]+)\2)/giu
const soundPattern = /\[sound:([^\]]+)\]/giu

const mimeTypes: Readonly<Record<string, string>> = {
  aac: 'audio/aac',
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css;charset=utf-8',
  flac: 'audio/flac',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jfif: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  m4a: 'audio/mp4',
  m4v: 'video/mp4',
  mid: 'audio/midi',
  midi: 'audio/midi',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  ogv: 'video/ogg',
  opus: 'audio/ogg; codecs=opus',
  otf: 'font/otf',
  png: 'image/png',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

function mediaFilename(reference: string): string | null {
  const trimmed = reference.trim()
  if (
    trimmed.length === 0
    || trimmed.startsWith('#')
    || /^(?:about|blob|data|file|https?|javascript|mailto):/iu.test(trimmed)
  ) {
    return null
  }

  const withoutSuffix = trimmed.split(/[?#]/u, 1)[0]
  if (!withoutSuffix)
    return null
  try {
    return decodeURIComponent(withoutSuffix).split('/').at(-1) ?? null
  }
  catch {
    return withoutSuffix.split('/').at(-1) ?? null
  }
}

function unquoteCssReference(reference: string): string {
  const trimmed = reference.trim()
  const hasDoubleQuotes = trimmed.startsWith('"') && trimmed.endsWith('"')
  const hasSingleQuotes = trimmed.startsWith('\'') && trimmed.endsWith('\'')
  if (trimmed.length >= 2 && (hasDoubleQuotes || hasSingleQuotes))
    return trimmed.slice(1, -1)
  return trimmed
}

function addReference(target: Set<string>, reference: string): void {
  const filename = mediaFilename(reference)
  if (filename)
    target.add(filename)
}

function collectCssReferences(css: string, target: Set<string>): void {
  for (const match of css.matchAll(cssUrlPattern))
    addReference(target, unquoteCssReference(match[1] ?? ''))
  for (const match of css.matchAll(cssImportPattern))
    addReference(target, unquoteCssReference(match[1] ?? match[3] ?? ''))
}

function collectHtmlReferences(html: string, target: Set<string>): void {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const selectors = [
    'audio[src]',
    'img[src]',
    'input[type="image"][src]',
    'link[rel~="stylesheet"][href]',
    'source[src]',
    'source[srcset]',
    'video[poster]',
    'video[src]',
  ].join(',')
  for (const element of document.querySelectorAll(selectors)) {
    for (const attribute of ['href', 'poster', 'src']) {
      const reference = element.getAttribute(attribute)
      if (reference)
        addReference(target, reference)
    }
    const srcset = element.getAttribute('srcset')
    if (srcset) {
      for (const candidate of srcset.split(','))
        addReference(target, candidate.trim().split(/\s+/u, 1)[0] ?? '')
    }
  }
  for (const element of document.querySelectorAll('[style]'))
    collectCssReferences(element.getAttribute('style') ?? '', target)
  for (const element of document.querySelectorAll('style'))
    collectCssReferences(element.textContent ?? '', target)
  for (const match of html.matchAll(soundPattern))
    addReference(target, match[1] ?? '')
}

function mimeType(filename: string): string {
  const extension = filename.split('.').at(-1)?.toLocaleLowerCase()
  if (!extension)
    return 'application/octet-stream'
  return mimeTypes[extension] ?? 'application/octet-stream'
}

function mediaDataUrl(files: AnkiCardMedia['files'], reference: string): string | null {
  const filename = mediaFilename(reference)
  if (!filename)
    return null
  const direct = files[filename]
  if (direct)
    return direct.dataUrl
  const basename = filename.split('/').at(-1)
  return basename ? files[basename]?.dataUrl ?? null : null
}

function isEmbeddedMedia(reference: string): boolean {
  return /^data:(?:audio|font|image|video)\//iu.test(reference.trim())
}

function rewriteCss(css: string, files: AnkiCardMedia['files'], importStack: ReadonlySet<string> = new Set()): string {
  const withImports = css.replace(cssImportPattern, (original, urlReference: string, _stringQuote: string, stringReference: string) => {
    const reference = unquoteCssReference(urlReference || stringReference)
    const filename = mediaFilename(reference)
    const file = filename ? files[filename] : undefined
    if (!file?.stylesheet)
      return original
    if (!filename || importStack.has(filename))
      return ''
    return rewriteCss(file.stylesheet, files, new Set([...importStack, filename]))
  })
  return withImports.replace(cssUrlPattern, (original, rawReference: string) => {
    const reference = unquoteCssReference(rawReference)
    const dataUrl = mediaDataUrl(files, reference)
    return dataUrl ? `url("${dataUrl}")` : original
  })
}

function soundMarkup(filename: string, files: AnkiCardMedia['files']): string {
  const dataUrl = mediaDataUrl(files, filename)
  if (!dataUrl)
    return ''
  return `<audio controls preload="metadata" src="${dataUrl}"></audio>`
}

function decodeBase64(filename: string, base64: string): Uint8Array {
  try {
    return Uint8Array.from(atob(base64), character => character.charCodeAt(0))
  }
  catch (error) {
    throw new AnkiConnectProtocolError(`Anki media file ${filename} is not valid base64`, { action: 'retrieveMediaFile', cause: error })
  }
}

function mediaFile(filename: string, base64: string): AnkiMediaFile {
  const type = mimeType(filename)
  const bytes = decodeBase64(filename, base64)
  return {
    dataUrl: `data:${type};base64,${base64}`,
    filename,
    mimeType: type,
    ...(type.startsWith('text/css') ? { stylesheet: new TextDecoder().decode(bytes) } : {}),
  }
}

export function findAnkiCardMediaFilenames(card: AnkiRenderableCard): readonly string[] {
  const filenames = new Set<string>()
  collectHtmlReferences(card.question, filenames)
  collectHtmlReferences(card.answer, filenames)
  collectCssReferences(card.css, filenames)
  return [...filenames]
}

export function renderAnkiCardDocument(card: AnkiRenderableCard, html: string, media: AnkiCardMedia | undefined): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  for (const script of document.querySelectorAll('script'))
    script.remove()

  const files = media?.files ?? {}
  for (const stylesheet of document.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const reference = stylesheet.getAttribute('href')
    const filename = reference ? mediaFilename(reference) : null
    const file = filename ? files[filename] : undefined
    if (!file?.stylesheet) {
      stylesheet.remove()
      continue
    }
    const style = document.createElement('style')
    style.textContent = rewriteCss(file.stylesheet, files)
    stylesheet.replaceWith(style)
  }
  for (const element of document.querySelectorAll('[href], [poster], [src]')) {
    for (const attribute of ['href', 'poster', 'src']) {
      const reference = element.getAttribute(attribute)
      if (!reference)
        continue
      const dataUrl = mediaDataUrl(files, reference)
      if (dataUrl) {
        element.setAttribute(attribute, dataUrl)
        continue
      }
      if (attribute !== 'href' && isEmbeddedMedia(reference))
        continue
      if (attribute !== 'href' || !reference.startsWith('#'))
        element.removeAttribute(attribute)
    }
  }
  for (const element of document.querySelectorAll('[srcset]')) {
    const srcset = element.getAttribute('srcset')
    if (!srcset)
      continue
    if (isEmbeddedMedia(srcset))
      continue
    const rewritten = srcset.split(',').flatMap((candidate) => {
      const [reference, ...descriptors] = candidate.trim().split(/\s+/u)
      if (!reference)
        return []
      const dataUrl = mediaDataUrl(files, reference)
      if (dataUrl)
        return [[dataUrl, ...descriptors].join(' ')]
      return isEmbeddedMedia(reference) ? [candidate.trim()] : []
    }).join(', ')
    if (rewritten.length > 0)
      element.setAttribute('srcset', rewritten)
    else
      element.removeAttribute('srcset')
  }
  for (const element of document.querySelectorAll('[style]'))
    element.setAttribute('style', rewriteCss(element.getAttribute('style') ?? '', files))
  for (const element of document.querySelectorAll('style'))
    element.textContent = rewriteCss(element.textContent ?? '', files)

  const body = document.body.innerHTML.replace(soundPattern, (_original, filename: string) => soundMarkup(filename, files))
  const templateCss = [...document.head.querySelectorAll('style')].map(style => style.textContent ?? '').join('\n')
  const css = rewriteCss(`${card.css}\n${templateCss}`, files).replace(/<\/style/giu, '<\\/style')
  const policy = 'default-src \'none\'; font-src data:; img-src data:; media-src data:; style-src \'unsafe-inline\' data:'
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>${css}html,body{margin:0;padding:12px;background:transparent;color:inherit;font:inherit;overflow-wrap:anywhere}audio,video{max-width:100%}img{max-width:100%;height:auto}</style></head><body>${body}</body></html>`
}

export function resolveAnkiCardMedia(client: AnkiConnectClient, card: AnkiRenderableCard): Effect.Effect<AnkiCardMedia, AnkiConnectError> {
  return Effect.gen(function* () {
    const pending = yield* Effect.try({
      try: () => [...findAnkiCardMediaFilenames(card)],
      catch: error => error instanceof AnkiConnectProtocolError
        ? error
        : new AnkiConnectProtocolError(`Failed to inspect media for Anki card ${card.cardId}`, { cause: error }),
    })
    const requested = new Set<string>()
    const files: Record<string, AnkiMediaFile> = {}
    const missing: string[] = []

    while (pending.length > 0) {
      const batch = pending.splice(0).filter(filename => !requested.has(filename))
      for (const filename of batch)
        requested.add(filename)
      const contents = yield* Effect.forEach(
        batch,
        filename => client.retrieveMediaFile(filename).pipe(Effect.map(content => ({ content, filename }))),
        { concurrency: 4 },
      )
      for (const { content, filename } of contents) {
        if (content === null) {
          missing.push(filename)
          continue
        }
        const file = yield* Effect.try({
          try: () => mediaFile(filename, content),
          catch: error => error instanceof AnkiConnectProtocolError
            ? error
            : new AnkiConnectProtocolError(`Failed to parse Anki media file ${filename}`, { cause: error }),
        })
        files[filename] = file
        if (file.stylesheet) {
          const nested = new Set<string>()
          collectCssReferences(file.stylesheet, nested)
          for (const reference of nested) {
            if (!requested.has(reference))
              pending.push(reference)
          }
        }
      }
    }

    return { files, missing }
  })
}
