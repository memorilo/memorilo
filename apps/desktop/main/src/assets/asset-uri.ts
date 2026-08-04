export const assetProtocol = 'memorilo-asset'

export const assetFileNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]+$/

export function parseAssetFileName(source: string): string | null {
  let url: URL
  try {
    url = new URL(source)
  }
  catch {
    return null
  }
  if (url.protocol !== `${assetProtocol}:` || url.username || url.password || url.port || url.search || url.hash)
    return null

  const encodedFileName = url.host.length > 0 && url.pathname === '/'
    ? url.host
    : url.host.length === 0 && url.pathname.startsWith('/') && !url.pathname.slice(1).includes('/')
      ? url.pathname.slice(1)
      : ''
  let fileName: string
  try {
    fileName = decodeURIComponent(encodedFileName)
  }
  catch {
    return null
  }
  return assetFileNamePattern.test(fileName) ? fileName : null
}

export function assetSource(fileName: string): string {
  if (!assetFileNamePattern.test(fileName))
    throw new TypeError(`Invalid asset file name: ${fileName}`)
  return `${assetProtocol}:///${fileName}`
}
