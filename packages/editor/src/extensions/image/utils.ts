export function createUploadId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `upload_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function isRemoteHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  }
  catch {
    return false
  }
}

export function getDataUrlMimeType(value: string) {
  if (!value.startsWith('data:')) {
    return null
  }
  const commaIndex = value.indexOf(',')
  if (commaIndex < 0) {
    return null
  }
  const header = value.slice('data:'.length, commaIndex)
  const mime = header.split(';')[0]?.trim()
  if (!mime || !mime.includes('/')) {
    return null
  }
  return mime.toLowerCase()
}

export function isBase64DataImageUrl(value: string) {
  if (!value.startsWith('data:image/')) {
    return false
  }
  const commaIndex = value.indexOf(',')
  if (commaIndex < 0) {
    return false
  }
  const header = value.slice(0, commaIndex).toLowerCase()
  return header.includes(';base64')
}
