export function normalizeShelfRemoteUrl(value: string, description: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError(`${description} must use HTTP or HTTPS`)
  return url.href
}
