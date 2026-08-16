import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  OpenShelfReadingInput,
  PreparedShelfReading,
  PrepareShelfReadingInput,
  ShelfAssetInput,
  ShelfAssetResult,
  ShelfBrowseResult,
  ShelfNavigationItem,
  ShelfPage,
  ShelfPublication,
  ShelfPublicationCollection,
  ShelfPublicationContributor,
  ShelfPublicationDetails,
  ShelfPublicationDetailsInput,
  ShelfPublicationLink,
  ShelfPublicationMetadata,
  ShelfPublicationSubject,
  ShelfReadingDocument,
  ShelfReadingOption,
  ShelfReadingRangeInput,
  ShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'
import type { Schema as EffectSchema } from 'effect'
import { Schema } from 'effect'
import { BookFileBindingSchema, NonNegativeIntegerSchema, nullable, PositiveIntegerSchema } from './common'

export const ShelfSourceSchema: EffectSchema.Codec<ShelfSource> = Schema.Struct({
  addedAt: Schema.Number,
  auth: Schema.Literals(['basic', 'none']),
  enabled: Schema.Boolean,
  id: Schema.NonEmptyString,
  kind: Schema.Literal('opds'),
  name: Schema.String,
  orderKey: Schema.NonEmptyString,
  updatedAt: Schema.Number,
  url: Schema.NonEmptyString,
  username: nullable(Schema.String),
})

export const ShelfNavigationItemSchema: EffectSchema.Codec<ShelfNavigationItem> = Schema.Struct({
  href: Schema.NonEmptyString,
  subtitle: nullable(Schema.String),
  title: Schema.String,
})

export const ShelfPublicationLinkSchema: EffectSchema.Codec<ShelfPublicationLink> = Schema.Struct({
  href: Schema.NonEmptyString,
  rel: Schema.NonEmptyString,
  type: nullable(Schema.String),
})

const ShelfPublicationContributorSchema: EffectSchema.Codec<ShelfPublicationContributor> = Schema.Struct({
  name: Schema.String,
  role: Schema.String,
})

const ShelfPublicationCollectionSchema: EffectSchema.Codec<ShelfPublicationCollection> = Schema.Struct({
  name: Schema.String,
  position: nullable(NonNegativeIntegerSchema),
  type: Schema.Literals(['collection', 'series']),
})

const ShelfPublicationSubjectSchema: EffectSchema.Codec<ShelfPublicationSubject> = Schema.Struct({
  code: nullable(Schema.String),
  name: Schema.String,
  scheme: nullable(Schema.String),
})

const ShelfPublicationMetadataSchema: EffectSchema.Codec<ShelfPublicationMetadata> = Schema.Struct({
  accessibilityFeatures: Schema.Array(Schema.String),
  accessibilityHazards: Schema.Array(Schema.String),
  accessibilityModes: Schema.Array(Schema.String),
  accessibilitySummary: nullable(Schema.String),
  collections: Schema.Array(ShelfPublicationCollectionSchema),
  conformsTo: Schema.Array(Schema.String),
  contributors: Schema.Array(ShelfPublicationContributorSchema),
  duration: nullable(NonNegativeIntegerSchema),
  identifiers: Schema.Array(Schema.String),
  imprints: Schema.Array(Schema.String),
  languages: Schema.Array(Schema.String),
  modified: nullable(Schema.String),
  numberOfPages: nullable(NonNegativeIntegerSchema),
  published: nullable(Schema.String),
  publishers: Schema.Array(Schema.String),
  readingProgression: nullable(Schema.String),
  rights: nullable(Schema.String),
  subjects: Schema.Array(ShelfPublicationSubjectSchema),
  types: Schema.Array(Schema.String),
})

export const ShelfPublicationSchema: EffectSchema.Codec<ShelfPublication> = Schema.Struct({
  authors: Schema.Array(Schema.String),
  coverUrl: nullable(Schema.String),
  id: Schema.NonEmptyString,
  links: Schema.Array(ShelfPublicationLinkSchema),
  metadata: Schema.optionalKey(ShelfPublicationMetadataSchema),
  section: nullable(Schema.String),
  subtitle: nullable(Schema.String),
  summary: nullable(Schema.String),
  title: Schema.String,
})

export const ShelfPageSchema: EffectSchema.Codec<ShelfPage> = Schema.Struct({
  navigation: Schema.Array(ShelfNavigationItemSchema),
  nextUrl: nullable(Schema.String),
  publications: Schema.Array(ShelfPublicationSchema),
  selfUrl: Schema.NonEmptyString,
  subtitle: nullable(Schema.String),
  title: Schema.String,
})

export const ShelfBrowseResultSchema: EffectSchema.Codec<ShelfBrowseResult> = Schema.Struct({
  groups: Schema.Array(Schema.Struct({
    issue: nullable(Schema.Union([
      Schema.Struct({ kind: Schema.Literals(['authentication', 'network', 'parse']) }),
      Schema.Struct({ kind: Schema.Literal('response'), status: PositiveIntegerSchema }),
    ])),
    page: nullable(ShelfPageSchema),
    source: ShelfSourceSchema,
  })),
  refreshedAt: nullable(Schema.Number),
})

export const ShelfPublicationDetailsSchema: EffectSchema.Codec<ShelfPublicationDetails> = Schema.Struct({
  publication: ShelfPublicationSchema,
  readingOptions: Schema.Array(Schema.Struct({
    format: Schema.Literals(['cbr', 'cbz', 'epub', 'pdf', 'txt']),
    mediaType: Schema.NonEmptyString,
    readingId: Schema.NonEmptyString,
    savedLocally: Schema.Boolean,
  }) satisfies EffectSchema.Codec<ShelfReadingOption>),
  source: ShelfSourceSchema,
})

export const PreparedShelfReadingSchema: EffectSchema.Codec<PreparedShelfReading> = Schema.Struct({
  book: BookFileBindingSchema,
  readingId: Schema.NonEmptyString,
})

export const ShelfReadingDocumentSchema: EffectSchema.Codec<ShelfReadingDocument> = Schema.Struct({
  book: BookFileBindingSchema,
  byteLength: PositiveIntegerSchema,
  format: Schema.Literals(['cbr', 'cbz', 'epub', 'pdf', 'txt']),
  name: Schema.NonEmptyString,
})

export const ShelfAssetResultSchema: EffectSchema.Codec<ShelfAssetResult, unknown> = Schema.Struct({
  bytes: Schema.Uint8ArrayFromBase64,
  mimeType: Schema.NonEmptyString,
})

export const AddShelfSourceInputSchema: EffectSchema.Codec<AddShelfSourceInput> = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  password: Schema.optionalKey(Schema.String),
  url: Schema.NonEmptyString,
  username: Schema.optionalKey(Schema.String),
})

export const UpdateShelfSourceInputSchema: EffectSchema.Codec<UpdateShelfSourceInput> = Schema.Struct({
  clearCredentials: Schema.optionalKey(Schema.Boolean),
  id: Schema.NonEmptyString,
  name: Schema.String,
  password: Schema.optionalKey(Schema.String),
  url: Schema.NonEmptyString,
  username: Schema.optionalKey(Schema.String),
})

export const BrowseShelfInputSchema: EffectSchema.Codec<BrowseShelfInput> = Schema.Struct({
  pageUrl: Schema.optionalKey(Schema.String),
  sourceId: Schema.optionalKey(Schema.NonEmptyString),
})

export const ShelfPublicationDetailsInputSchema: EffectSchema.Codec<ShelfPublicationDetailsInput> = Schema.Struct({
  publicationId: Schema.NonEmptyString,
  sourceId: Schema.NonEmptyString,
})

export const PrepareShelfReadingInputSchema: EffectSchema.Codec<PrepareShelfReadingInput> = Schema.Struct({
  format: Schema.Literals(['cbr', 'cbz', 'epub', 'pdf', 'txt']),
  publicationId: Schema.NonEmptyString,
  retention: Schema.Literals(['cache', 'library']),
  sourceId: Schema.NonEmptyString,
})

export const OpenShelfReadingInputSchema: EffectSchema.Codec<OpenShelfReadingInput> = Schema.Struct({
  readingId: Schema.NonEmptyString,
})

export const ShelfReadingRangeInputSchema: EffectSchema.Codec<ShelfReadingRangeInput> = Schema.Struct({
  length: PositiveIntegerSchema,
  offset: NonNegativeIntegerSchema,
  readingId: Schema.NonEmptyString,
})

export const ShelfAssetInputSchema: EffectSchema.Codec<ShelfAssetInput> = Schema.Struct({
  sourceId: Schema.NonEmptyString,
  url: Schema.NonEmptyString,
})
