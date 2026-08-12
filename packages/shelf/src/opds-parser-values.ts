import type {
  ShelfPublicationCollection,
  ShelfPublicationContributor,
  ShelfPublicationLink,
  ShelfPublicationSubject,
} from './model'

export type OpdsRecord = Record<string, unknown>

const thumbnailRelations = new Set([
  'http://opds-spec.org/image/thumbnail',
  'https://opds-spec.org/image/thumbnail',
  'thumbnail',
])

const fullImageRelations = new Set([
  'http://opds-spec.org/image',
  'https://opds-spec.org/image',
  'image',
])

const contributorRoles = [
  'translator',
  'editor',
  'artist',
  'illustrator',
  'letterer',
  'penciler',
  'colorist',
  'inker',
  'narrator',
  'contributor',
] as const

export function asOpdsRecord(value: unknown): OpdsRecord | null {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
    ? value as OpdsRecord
    : null
}

export function asOpdsArray(value: unknown): readonly unknown[] {
  if (value === undefined || value === null)
    return []
  return Array.isArray(value) ? value : [value]
}

export function optionalOpdsString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function opdsText(value: unknown): string | null {
  const direct = optionalOpdsString(value)
  if (direct !== null)
    return direct
  const record = asOpdsRecord(value)
  return record ? optionalOpdsString(record['#text']) : null
}

export function opdsContentText(value: unknown): string | null {
  const values = asOpdsArray(value).flatMap((candidate): readonly string[] => {
    const direct = optionalOpdsString(candidate)
    if (direct !== null)
      return [direct]
    const record = asOpdsRecord(candidate)
    if (record === null)
      return []
    return Object.entries(record)
      .filter(([key]) => !key.startsWith('@_'))
      .flatMap(([, child]) => {
        const text = opdsContentText(child)
        return text === null ? [] : [text]
      })
  })
  return values.length === 0 ? null : values.join('\n\n')
}

export function opdsSummary(value: unknown): string | null {
  const text = opdsContentText(value)
  if (text === null)
    return null
  const blocks = text.split(/\n{2,}/u).filter(block => !/^TAGS:\s*/iu.test(block.trim()))
  return blocks.length === 0 ? null : blocks.join('\n\n')
}

export function requiredOpdsTitle(value: unknown, description: string): string {
  const title = opdsText(value)
  if (title === null)
    throw new TypeError(`${description} is missing a title`)
  return title
}

export function resolveOpdsHref(value: unknown, baseUrl: string): string | null {
  const href = optionalOpdsString(value)
  if (href === null)
    return null
  const url = new URL(href, baseUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return null
  return url.href
}

export function opdsRelationValues(value: unknown): readonly string[] {
  if (Array.isArray(value))
    return value.flatMap(item => optionalOpdsString(item) ? [String(item)] : [])
  const relation = optionalOpdsString(value)
  return relation === null ? [] : relation.split(/\s+/u)
}

export function firstOpdsLink(
  links: readonly ShelfPublicationLink[],
  relation: string,
): string | null {
  return links.find(link => opdsRelationValues(link.rel).includes(relation))?.href ?? null
}

export function preferredOpdsImage(
  links: readonly ShelfPublicationLink[],
): ShelfPublicationLink | null {
  return links.find(link => opdsRelationValues(link.rel).some(relation => thumbnailRelations.has(relation)))
    ?? links.find(link => opdsRelationValues(link.rel).some(relation => fullImageRelations.has(relation)))
    ?? null
}

export function normalizeOpdsContributors(value: unknown): readonly string[] {
  return asOpdsArray(value).flatMap((candidate) => {
    const direct = optionalOpdsString(candidate)
    if (direct !== null)
      return [direct]
    const contributor = asOpdsRecord(candidate)
    const name = contributor ? optionalOpdsString(contributor.name) : null
    return name === null ? [] : [name]
  })
}

export function normalizeOpdsTextList(value: unknown): readonly string[] {
  return asOpdsArray(value).flatMap((candidate) => {
    const text = opdsText(candidate)
    return text === null ? [] : [text]
  })
}

export function optionalOpdsNonNegativeNumber(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null
}

export function normalizeOpdsSubjects(value: unknown): readonly ShelfPublicationSubject[] {
  return asOpdsArray(value).flatMap((candidate) => {
    const direct = optionalOpdsString(candidate)
    if (direct !== null)
      return [{ code: null, name: direct, scheme: null }]
    const subject = asOpdsRecord(candidate)
    if (subject === null)
      return []
    const name = opdsText(subject.name)
      ?? optionalOpdsString(subject['@_label'])
      ?? optionalOpdsString(subject.label)
      ?? optionalOpdsString(subject['@_term'])
      ?? optionalOpdsString(subject.code)
    if (name === null)
      return []
    return [{
      code: optionalOpdsString(subject.code) ?? optionalOpdsString(subject['@_term']),
      name,
      scheme: optionalOpdsString(subject.scheme) ?? optionalOpdsString(subject['@_scheme']),
    }]
  })
}

export function normalizeOpdsCollections(
  value: unknown,
  type: ShelfPublicationCollection['type'],
  fallbackPosition: unknown = null,
): readonly ShelfPublicationCollection[] {
  const collections = asOpdsArray(value).flatMap((candidate) => {
    const direct = optionalOpdsString(candidate)
    if (direct !== null)
      return [{ name: direct, position: null, type }]
    const collection = asOpdsRecord(candidate)
    if (collection === null)
      return []
    const name = opdsText(collection.name) ?? opdsText(collection.title)
    if (name === null)
      return []
    return [{
      name,
      position: optionalOpdsNonNegativeNumber(collection.position ?? collection.number),
      type,
    }]
  })
  const position = optionalOpdsNonNegativeNumber(fallbackPosition)
  if (collections.length !== 1 || collections[0]?.position !== null || position === null)
    return collections
  return [{ ...collections[0], position }]
}

export function normalizeOpdsContributorRoles(
  metadata: OpdsRecord,
): readonly ShelfPublicationContributor[] {
  return contributorRoles.flatMap(role => (
    normalizeOpdsContributors(metadata[role]).map(name => ({ name, role }))
  ))
}
