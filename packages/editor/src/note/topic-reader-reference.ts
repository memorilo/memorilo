export interface TopicReaderTextSource {
  kind: 'text'
  location: string
  text: string
}

export interface TopicReaderRegionSource {
  imageSrc: string
  kind: 'region'
  location: string
}

export type TopicReaderSource = TopicReaderRegionSource | TopicReaderTextSource

export type TopicReaderReference
  = | {
    annotationId: string
    bookTopicId: string
    source: TopicReaderSource
  }
  | {
    annotationId?: never
    bookTopicId?: never
    source: TopicReaderSource
  }

export function isLinkedTopicReaderReference(
  reference: TopicReaderReference,
): reference is Extract<TopicReaderReference, { annotationId: string, bookTopicId: string }> {
  return reference.annotationId !== undefined
}

function nonEmptyString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
  return value
}

function objectRecord(value: unknown, description: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${description} must be an object`)
  return value as Record<string, unknown>
}

function assertExactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, description: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      throw new TypeError(`${description} contains unknown field ${key}`)
  }
}

function normalizeSource(value: unknown): TopicReaderSource {
  const source = objectRecord(value, 'Topic Reader source')
  if (source.kind === 'text') {
    assertExactKeys(source, new Set(['kind', 'location', 'text']), 'Topic Reader text source')
    return {
      kind: 'text',
      location: nonEmptyString(source.location, 'Topic Reader source location'),
      text: nonEmptyString(source.text, 'Topic Reader source text'),
    }
  }
  if (source.kind === 'region') {
    assertExactKeys(source, new Set(['imageSrc', 'kind', 'location']), 'Topic Reader region source')
    return {
      imageSrc: nonEmptyString(source.imageSrc, 'Topic Reader source image'),
      kind: 'region',
      location: nonEmptyString(source.location, 'Topic Reader source location'),
    }
  }
  throw new TypeError('Topic Reader source kind must be "text" or "region"')
}

export function normalizeTopicReaderReference(value: unknown): TopicReaderReference {
  const reference = objectRecord(value, 'Topic Reader reference')
  const hasAnnotationId = Object.prototype.hasOwnProperty.call(reference, 'annotationId')
  const hasBookTopicId = Object.prototype.hasOwnProperty.call(reference, 'bookTopicId')
  if (hasAnnotationId !== hasBookTopicId)
    throw new TypeError('Topic Reader reference link requires both annotationId and bookTopicId')
  if (!hasAnnotationId) {
    assertExactKeys(reference, new Set(['source']), 'Detached Topic Reader reference')
    return { source: normalizeSource(reference.source) }
  }
  assertExactKeys(reference, new Set(['annotationId', 'bookTopicId', 'source']), 'Linked Topic Reader reference')
  return {
    annotationId: nonEmptyString(reference.annotationId, 'Topic Reader annotation id'),
    bookTopicId: nonEmptyString(reference.bookTopicId, 'Topic Reader BookTopic id'),
    source: normalizeSource(reference.source),
  }
}
