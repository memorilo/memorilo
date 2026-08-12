import type { Effect } from 'effect'
import { Exit, Schema } from 'effect'
import {
  LoroTopicDocumentSchema,
  strictTopicParseOptions,
  TopicAttributesSchema,
} from './topic-document-schema'

export type {
  LoroTopicDocument,
  LoroTopicMarkType,
  LoroTopicNode,
  LoroTopicNodeType,
} from './topic-document-schema'
export {
  LoroTopicDocumentSchema,
  LoroTopicNodeSchema,
} from './topic-document-schema'

const NonNegativeIntegerSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveIntegerSchema = Schema.Int.check(Schema.isGreaterThan(0))
const UnitIntervalSchema = Schema.Number.check(Schema.isBetween({ maximum: 1, minimum: 0 }))
const ReadingFormatSchema = Schema.Literals(['cbr', 'cbz', 'epub', 'pdf', 'txt'])
const BookFileSha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))
const ReadingAnnotationColorSchema = Schema.Literals(['blue', 'green', 'pink', 'purple', 'yellow'])
const ReadingNormalizedRectSchema = Schema.Struct({
  height: UnitIntervalSchema,
  width: UnitIntervalSchema,
  x: UnitIntervalSchema,
  y: UnitIntervalSchema,
})
const ReadingTextQuoteSchema = Schema.Struct({
  after: Schema.optionalKey(Schema.String),
  before: Schema.optionalKey(Schema.String),
  exact: Schema.String,
})
const ReadingEpubLocatorSchema = Schema.Struct({
  href: Schema.NonEmptyString,
  locations: Schema.optionalKey(TopicAttributesSchema),
  text: Schema.optionalKey(TopicAttributesSchema),
  title: Schema.optionalKey(Schema.String),
  type: Schema.NonEmptyString,
})
const ReadingPdfTextAnchorSchema = Schema.Struct({
  format: Schema.Literal('pdf'),
  pageNumber: PositiveIntegerSchema,
  quote: ReadingTextQuoteSchema,
  rects: Schema.Array(ReadingNormalizedRectSchema),
  source: Schema.Literals(['embedded', 'ocr']),
  type: Schema.Literal('text'),
})
const ReadingPdfRegionAnchorSchema = Schema.Struct({
  format: Schema.Literal('pdf'),
  pageNumber: PositiveIntegerSchema,
  rect: ReadingNormalizedRectSchema,
  type: Schema.Literal('region'),
})
const ReadingEpubTextAnchorSchema = Schema.Struct({
  format: Schema.Literal('epub'),
  locator: ReadingEpubLocatorSchema,
  quote: ReadingTextQuoteSchema,
  type: Schema.Literal('text'),
})
const ReadingEpubRegionAnchorSchema = Schema.Struct({
  format: Schema.Literal('epub'),
  locator: ReadingEpubLocatorSchema,
  targets: Schema.Array(Schema.Struct({
    rect: ReadingNormalizedRectSchema,
    selector: Schema.NonEmptyString,
  })),
  type: Schema.Literal('region'),
})
const ReadingTxtTextAnchorSchema = Schema.Struct({
  end: NonNegativeIntegerSchema,
  format: Schema.Literal('txt'),
  quote: ReadingTextQuoteSchema,
  start: NonNegativeIntegerSchema,
  type: Schema.Literal('text'),
})
const ReadingTxtRegionAnchorSchema = Schema.Struct({
  end: NonNegativeIntegerSchema,
  format: Schema.Literal('txt'),
  start: NonNegativeIntegerSchema,
  type: Schema.Literal('region'),
})
const ReadingComicRegionAnchorSchema = Schema.Struct({
  format: Schema.Literals(['cbr', 'cbz']),
  pageNumber: PositiveIntegerSchema,
  rect: ReadingNormalizedRectSchema,
  type: Schema.Literal('region'),
})
const ReadingAnchorSchema = Schema.Union([
  ReadingComicRegionAnchorSchema,
  ReadingEpubRegionAnchorSchema,
  ReadingEpubTextAnchorSchema,
  ReadingPdfRegionAnchorSchema,
  ReadingPdfTextAnchorSchema,
  ReadingTxtRegionAnchorSchema,
  ReadingTxtTextAnchorSchema,
])
const ReadingAnnotationBaseFields = {
  anchor: ReadingAnchorSchema,
  color: ReadingAnnotationColorSchema,
  createdAt: NonNegativeIntegerSchema,
  id: Schema.NonEmptyString,
  updatedAt: NonNegativeIntegerSchema,
} as const
const ReadingAnnotationSchema = Schema.Union([
  Schema.Struct({
    ...ReadingAnnotationBaseFields,
    kind: Schema.Literal('highlight'),
  }),
  Schema.Struct({
    ...ReadingAnnotationBaseFields,
    body: Schema.NonEmptyString,
    kind: Schema.Literal('annotation'),
  }),
])
const ReadingPositionSchema = Schema.Union([
  Schema.Struct({ format: Schema.Literals(['cbr', 'cbz']), pageNumber: PositiveIntegerSchema }),
  Schema.Struct({ format: Schema.Literal('epub'), locator: ReadingEpubLocatorSchema }),
  Schema.Struct({ format: Schema.Literal('pdf'), pageNumber: PositiveIntegerSchema }),
  Schema.Struct({ format: Schema.Literal('txt'), offset: NonNegativeIntegerSchema }),
])
const BookFileLocatorSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('local'),
    readingId: Schema.NonEmptyString,
  }),
  Schema.Struct({
    kind: Schema.Literal('shelf'),
    publicationId: Schema.NonEmptyString,
    readingId: Schema.NonEmptyString,
    sourceId: Schema.NonEmptyString,
  }),
])
const BookFileBindingSchema = Schema.Struct({
  book: Schema.Struct({
    authors: Schema.Array(Schema.NonEmptyString),
    title: Schema.NonEmptyString,
  }),
  file: Schema.Struct({
    byteLength: PositiveIntegerSchema,
    format: ReadingFormatSchema,
    originalName: Schema.NonEmptyString,
    sha256: BookFileSha256Schema,
  }),
  retrievalHints: Schema.Array(BookFileLocatorSchema),
})

const LoroTopicEntryBaseFields = {
  blockTreeKey: Schema.NonEmptyString,
  editorMode: Schema.Literals([0, 1]),
  entryId: Schema.NonEmptyString,
  kind: Schema.Literal('topic'),
  title: Schema.String,
} as const

export const LoroRegularTopicEntrySchema = Schema.Struct({
  ...LoroTopicEntryBaseFields,
  topicType: Schema.Literal('regular'),
})

export const LoroBookTopicEntrySchema = Schema.Struct({
  ...LoroTopicEntryBaseFields,
  annotationsKey: Schema.NonEmptyString,
  book: BookFileBindingSchema,
  readingStateKey: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  topicType: Schema.Literal('book'),
})

export const LoroTopicEntrySchema = Schema.Union([
  LoroBookTopicEntrySchema,
  LoroRegularTopicEntrySchema,
])

const LoroRegularTopicSchema = Schema.Struct({
  document: LoroTopicDocumentSchema,
  entry: LoroRegularTopicEntrySchema,
})

const LoroBookTopicSchema = Schema.Struct({
  annotations: Schema.Record(Schema.String, ReadingAnnotationSchema),
  document: LoroTopicDocumentSchema,
  entry: LoroBookTopicEntrySchema,
  readingState: Schema.Struct({
    position: Schema.NullOr(ReadingPositionSchema),
  }),
})

/** A complete Topic projected from its Loro entry map and referenced block tree. */
export const LoroTopicSchema = Schema.Union([
  LoroBookTopicSchema,
  LoroRegularTopicSchema,
]).check(Schema.makeFilter((topic) => {
  const id = topic.entry.entryId
  const expectedBlockTreeKey = `topic:${id}:blocks`
  if (topic.entry.blockTreeKey !== expectedBlockTreeKey) {
    return {
      message: `expected the Topic block tree key ${JSON.stringify(expectedBlockTreeKey)}`,
      path: ['entry', 'blockTreeKey'],
    }
  }
  if (topic.entry.topicType === 'regular')
    return undefined
  if (!('annotations' in topic) || !('readingState' in topic)) {
    return {
      message: 'expected BookTopic annotations and reading state',
      path: [],
    }
  }
  const expectedReadingStateKey = `topic:${id}:reading-state`
  if (topic.entry.readingStateKey !== expectedReadingStateKey) {
    return {
      message: `expected the BookTopic reading state key ${JSON.stringify(expectedReadingStateKey)}`,
      path: ['entry', 'readingStateKey'],
    }
  }
  const expectedAnnotationsKey = `topic:${id}:annotations`
  if (topic.entry.annotationsKey !== expectedAnnotationsKey) {
    return {
      message: `expected the BookTopic annotations key ${JSON.stringify(expectedAnnotationsKey)}`,
      path: ['entry', 'annotationsKey'],
    }
  }
  const format = topic.entry.book.file.format
  if (topic.readingState.position !== null && topic.readingState.position.format !== format) {
    return {
      message: `expected a ${format} BookTopic reading position`,
      path: ['readingState', 'position', 'format'],
    }
  }
  for (const [annotationId, annotation] of Object.entries(topic.annotations)) {
    if (annotation.id !== annotationId) {
      return {
        message: `expected annotation id ${JSON.stringify(annotationId)}`,
        path: ['annotations', annotationId, 'id'],
      }
    }
    if (annotation.anchor.format !== format) {
      return {
        message: `expected a ${format} BookTopic annotation anchor`,
        path: ['annotations', annotationId, 'anchor', 'format'],
      }
    }
  }
  return undefined
}, {
  expected: 'a Topic whose entry and BookTopic state reference their own Loro containers',
}))

export type LoroTopic = typeof LoroTopicSchema.Type
export type LoroBookTopic = typeof LoroBookTopicSchema.Type
export type LoroRegularTopic = typeof LoroRegularTopicSchema.Type
export type LoroTopicValidation = Effect.Effect<LoroTopic, Schema.SchemaError>

/** Validates unknown Topic JSON and retains all schema issues in Effect's error channel. */
export function validateLoroTopic(input: unknown): LoroTopicValidation {
  return Schema.decodeUnknownEffect(LoroTopicSchema)(input, strictTopicParseOptions)
}

/** Returns whether an unknown value has the complete Loro Topic structure. */
export function isLoroTopic(input: unknown): input is LoroTopic {
  return Exit.isSuccess(Schema.decodeUnknownExit(LoroTopicSchema)(input, strictTopicParseOptions))
}
