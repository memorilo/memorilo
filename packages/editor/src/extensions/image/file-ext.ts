import * as mimeTypes from 'mime-types'

function normalizeMime(mime: string | null | undefined) {
  const raw = mime?.toLowerCase().split(';')[0]?.trim()
  return raw || null
}

export function extFromMime(mime: string | null | undefined) {
  const normalized = normalizeMime(mime)
  if (!normalized) {
    return null
  }
  const ext = mimeTypes.extension(normalized)
  return typeof ext === 'string' ? ext : null
}

export function inferFileExtension(file: File) {
  const name = file.name ?? ''
  const ext = name.split('.').pop()
  if (ext && ext !== name && /^[a-z0-9]+$/i.test(ext)) {
    return ext.toLowerCase()
  }

  return extFromMime(file.type)
}
