import type {
  BookFileBinding,
  BookReadingState,
  ReadingAnnotation,
} from '@memorilo/reading-model'
import type { Schema as EffectSchema } from 'effect'
import { Schema } from 'effect'

export const EmptyArgumentsSchema = Schema.Tuple([])
export const StringArgumentSchema = Schema.Tuple([Schema.NonEmptyString])
export const OptionalBooleanArgumentSchema = Schema.Union([
  Schema.Tuple([Schema.NonEmptyString]),
  Schema.Tuple([Schema.NonEmptyString, Schema.Boolean]),
])
export const NullResultSchema = Schema.Null

export const NonNegativeIntegerSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const PositiveIntegerSchema = Schema.Int.check(Schema.isGreaterThan(0))
export const PositiveNumberSchema = Schema.Number.check(Schema.isGreaterThan(0))

export function nullable<S extends EffectSchema.Top>(schema: S) {
  return Schema.Union([schema, Schema.Null])
}

export function optionalArgument<S extends EffectSchema.Top>(schema: S) {
  return Schema.Union([Schema.Tuple([]), Schema.Tuple([schema])])
}

export function jsonValue<Type>(): EffectSchema.Codec<Type, EffectSchema.Json> {
  return Schema.Json as unknown as EffectSchema.Codec<Type, EffectSchema.Json>
}

const ReadingFormatSchema = Schema.Literals(['cbr', 'cbz', 'epub', 'pdf', 'txt'])

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

export const BookFileBindingSchema: EffectSchema.Codec<BookFileBinding> = Schema.Struct({
  book: Schema.Struct({
    authors: Schema.Array(Schema.NonEmptyString),
    title: Schema.NonEmptyString,
  }),
  file: Schema.Struct({
    byteLength: PositiveIntegerSchema,
    format: ReadingFormatSchema,
    originalName: Schema.NonEmptyString,
    sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
  }),
  retrievalHints: Schema.Array(BookFileLocatorSchema),
})

const ReadingPositionSchema = Schema.Union([
  Schema.Struct({
    format: Schema.Literal('epub'),
    locator: Schema.Struct({
      href: Schema.NonEmptyString,
      locations: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
      text: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
      title: Schema.optionalKey(Schema.String),
      type: Schema.NonEmptyString,
    }),
  }),
  Schema.Struct({
    format: Schema.Literal('pdf'),
    pageNumber: PositiveIntegerSchema,
    pageProgress: Schema.Number,
  }),
  Schema.Struct({
    format: Schema.Literals(['cbr', 'cbz']),
    pageNumber: PositiveIntegerSchema,
    pageProgress: Schema.Number,
  }),
  Schema.Struct({
    format: Schema.Literal('txt'),
    offset: NonNegativeIntegerSchema,
  }),
])

const ReadingAnnotationSchema = jsonValue<ReadingAnnotation>()

export const BookReadingStateSchema: EffectSchema.Codec<BookReadingState, EffectSchema.Json> = Schema.Struct({
  annotations: Schema.Array(ReadingAnnotationSchema),
  position: nullable(ReadingPositionSchema),
})
