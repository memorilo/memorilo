import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { parseAssetFileName } from './assets/asset-uri'

const contentTypes: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
}

export function createAssetProtocolHandler(assetDirectory: string | null) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'GET')
      return new Response(null, { status: 405 })
    if (assetDirectory === null)
      return new Response(null, { status: 404 })

    const fileName = parseAssetFileName(request.url)
    if (!fileName)
      return new Response(null, { status: 400 })

    const contentType = contentTypes[extname(fileName)]
    if (!contentType)
      return new Response(null, { status: 415 })

    try {
      const data = await readFile(join(assetDirectory, fileName))
      return new Response(data, {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined
      if (code === 'ENOENT')
        return new Response(null, { status: 404 })
      throw error
    }
  }
}
