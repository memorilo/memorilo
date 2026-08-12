import type { Effect, SchemaAST } from 'effect'
import { Exit, Option, Schema, SchemaIssue } from 'effect'
import { topicProseMirrorSchema } from './topic-prosemirror-schema'

export type LoroTopicNodeType
  = | 'blockquote'
    | 'cardDelimiter'
    | 'codeBlock'
    | 'hardBreak'
    | 'heading'
    | 'horizontalRule'
    | 'image'
    | 'list'
    | 'mathBlock'
    | 'mathInline'
    | 'paragraph'
    | 'table'
    | 'tableCell'
    | 'tableHeaderCell'
    | 'tableRow'
    | 'tag'
    | 'text'

export type LoroTopicMarkType
  = | 'bold'
    | 'cloze'
    | 'code'
    | 'inlineHighlight'
    | 'italic'
    | 'link'
    | 'strike'
    | 'underline'

export interface LoroTopicNode {
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly LoroTopicNode[]
  readonly marks?: ReadonlyArray<{
    readonly attrs?: Readonly<Record<string, unknown>>
    readonly type: LoroTopicMarkType
  }>
  readonly text?: string
  readonly type: LoroTopicNodeType
}

export interface LoroTopicDocument {
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly LoroTopicNode[]
  readonly type: 'doc'
}

const strictParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
} as const

const AttributesSchema = Schema.Record(Schema.String, Schema.Unknown)
const MarkSchema = Schema.Struct({
  attrs: Schema.optionalKey(AttributesSchema),
  type: Schema.Literals(['bold', 'cloze', 'code', 'inlineHighlight', 'italic', 'link', 'strike', 'underline']),
})
const NodeTypeSchema = Schema.Literals([
  'blockquote',
  'cardDelimiter',
  'codeBlock',
  'hardBreak',
  'heading',
  'horizontalRule',
  'image',
  'list',
  'mathBlock',
  'mathInline',
  'paragraph',
  'table',
  'tableCell',
  'tableHeaderCell',
  'tableRow',
  'tag',
  'text',
])

export const LoroTopicNodeSchema: Schema.Codec<LoroTopicNode> = Schema.Struct({
  attrs: Schema.optionalKey(AttributesSchema),
  content: Schema.optionalKey(Schema.Array(Schema.suspend(() => LoroTopicNodeSchema))),
  marks: Schema.optionalKey(Schema.Array(MarkSchema)),
  text: Schema.optionalKey(Schema.String),
  type: NodeTypeSchema,
})

const blockNodeTypes = new Set<LoroTopicNodeType>([
  'blockquote',
  'codeBlock',
  'heading',
  'horizontalRule',
  'image',
  'list',
  'mathBlock',
  'paragraph',
  'table',
])
const inlineNodeTypes = new Set<LoroTopicNodeType>(['cardDelimiter', 'hardBreak', 'mathInline', 'tag', 'text'])
const tableCellNodeTypes = new Set<LoroTopicNodeType>(['tableCell', 'tableHeaderCell'])

type ChildExpectation = 'block' | 'inline' | 'table-cell' | 'table-row' | 'text'

function validateTopicDocument(
  document: LoroTopicDocument,
  ast: SchemaAST.AST,
  options: SchemaAST.ParseOptions,
): undefined | SchemaIssue.Issue {
  const blockIds = new Set<string>()
  const issues: SchemaIssue.Issue[] = []

  const addIssue = (path: readonly PropertyKey[], actual: unknown, message: string): void => {
    issues.push(new SchemaIssue.Pointer(
      path,
      new SchemaIssue.InvalidValue(Option.some(actual), { message }),
    ))
  }

  const expectChild = (
    child: LoroTopicNode,
    path: readonly PropertyKey[],
    expectation: ChildExpectation,
  ): void => {
    const valid = expectation === 'block'
      ? blockNodeTypes.has(child.type)
      : expectation === 'inline'
        ? inlineNodeTypes.has(child.type)
        : expectation === 'table-cell'
          ? tableCellNodeTypes.has(child.type)
          : expectation === 'table-row'
            ? child.type === 'tableRow'
            : child.type === expectation
    if (!valid)
      addIssue([...path, 'type'], child.type, `expected a ${expectation} Topic node`)
  }

  const visit = (node: LoroTopicNode, path: readonly PropertyKey[]): void => {
    const children = node.content ?? []
    const nodeType = topicProseMirrorSchema.nodes[node.type]
    const allowedNodeAttrs = new Set(Object.keys(nodeType?.spec.attrs ?? {}))
    for (const [name, value] of Object.entries(node.attrs ?? {})) {
      if (!allowedNodeAttrs.has(name))
        addIssue([...path, 'attrs', name], value, `unexpected attribute for Topic node ${node.type}`)
    }
    for (const [markIndex, mark] of (node.marks ?? []).entries()) {
      const markType = topicProseMirrorSchema.marks[mark.type]
      const allowedMarkAttrs = new Set(Object.keys(markType?.spec.attrs ?? {}))
      for (const [name, value] of Object.entries(mark.attrs ?? {})) {
        if (!allowedMarkAttrs.has(name))
          addIssue([...path, 'marks', markIndex, 'attrs', name], value, `unexpected attribute for Topic mark ${mark.type}`)
      }
    }
    if (node.type !== 'text' && node.text !== undefined)
      addIssue([...path, 'text'], node.text, `Topic node ${node.type} must not contain text directly`)
    if (!inlineNodeTypes.has(node.type) && node.marks !== undefined)
      addIssue([...path, 'marks'], node.marks, `Topic node ${node.type} must not contain marks`)

    let childExpectation: ChildExpectation | undefined
    let requiresChildren = false

    switch (node.type) {
      case 'list': {
        const blockId = node.attrs?.blockId
        if (typeof blockId !== 'string' || blockId.length === 0) {
          addIssue([...path, 'attrs', 'blockId'], blockId, 'expected a non-empty Topic blockId')
        }
        else if (blockIds.has(blockId)) {
          addIssue([...path, 'attrs', 'blockId'], blockId, `duplicate Topic blockId: ${blockId}`)
        }
        else {
          blockIds.add(blockId)
        }

        const kind = node.attrs?.kind
        if (typeof kind !== 'string' || kind.length === 0)
          addIssue([...path, 'attrs', 'kind'], kind, 'expected a non-empty Topic block kind')
        childExpectation = 'block'
        requiresChildren = true
        break
      }
      case 'blockquote':
      case 'tableCell':
      case 'tableHeaderCell':
        childExpectation = 'block'
        requiresChildren = true
        break
      case 'heading':
      case 'paragraph':
        childExpectation = 'inline'
        break
      case 'codeBlock':
      case 'mathBlock':
      case 'mathInline':
        childExpectation = 'text'
        break
      case 'table':
        childExpectation = 'table-row'
        requiresChildren = true
        break
      case 'tableRow':
        childExpectation = 'table-cell'
        break
      case 'text':
        if (typeof node.text !== 'string' || node.text.length === 0)
          addIssue([...path, 'text'], node.text, 'expected non-empty Topic text')
        break
      case 'cardDelimiter':
      case 'hardBreak':
      case 'horizontalRule':
      case 'image':
      case 'tag':
        break
    }

    if (requiresChildren && children.length === 0)
      addIssue([...path, 'content'], children, `Topic node ${node.type} requires content`)
    if (!childExpectation && children.length > 0)
      addIssue([...path, 'content'], children, `Topic node ${node.type} must not contain children`)

    children.forEach((child, index) => {
      const childPath = [...path, 'content', index]
      if (childExpectation)
        expectChild(child, childPath, childExpectation)
      visit(child, childPath)
    })
  }

  for (const [name, value] of Object.entries(document.attrs ?? {}))
    addIssue(['attrs', name], value, 'unexpected attribute for the Topic document')

  const roots = document.content ?? []
  if (roots.length === 0)
    addIssue(['content'], roots, 'a Topic document requires at least one block')
  roots.forEach((node, index) => {
    if (node.type !== 'list')
      addIssue(['content', index, 'type'], node.type, 'expected a top-level Topic block with type "list"')
    visit(node, ['content', index])
  })

  try {
    topicProseMirrorSchema.nodeFromJSON(document).check()
  }
  catch (error) {
    addIssue([], document, `invalid ProseMirror Topic document: ${error instanceof Error ? error.message : String(error)}`)
  }

  const [first, ...rest] = issues
  if (!first)
    return undefined
  return new SchemaIssue.Composite(ast, Option.some(document), [
    first,
    ...(options.errors === 'all' ? rest : []),
  ])
}

export const LoroTopicDocumentSchema = Schema.Struct({
  attrs: Schema.optionalKey(AttributesSchema),
  content: Schema.optionalKey(Schema.Array(LoroTopicNodeSchema)),
  type: Schema.Literal('doc'),
}).check(Schema.makeFilter(validateTopicDocument, {
  expected: 'a normalized Topic document with unique blocks',
}))

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
  locations: Schema.optionalKey(AttributesSchema),
  text: Schema.optionalKey(AttributesSchema),
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

export const LoroWhiteboardTopicEntrySchema = Schema.Struct({
  ...LoroTopicEntryBaseFields,
  title: Schema.String,
  topicType: Schema.Literal('whiteboard'),
  whiteboardSceneKey: Schema.NonEmptyString,
})

export const LoroTopicEntrySchema = Schema.Union([
  LoroBookTopicEntrySchema,
  LoroRegularTopicEntrySchema,
  LoroWhiteboardTopicEntrySchema,
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

const LoroWhiteboardTopicSchema = Schema.Struct({
  document: LoroTopicDocumentSchema,
  entry: LoroWhiteboardTopicEntrySchema,
  scene: Schema.Record(Schema.String, Schema.Unknown),
})

/** A complete Topic projected from its Loro entry map and referenced block tree. */
export const LoroTopicSchema = Schema.Union([
  LoroBookTopicSchema,
  LoroRegularTopicSchema,
  LoroWhiteboardTopicSchema,
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
  if (topic.entry.topicType === 'whiteboard') {
    const expectedSceneKey = `topic:${id}:whiteboard-scene`
    if (topic.entry.whiteboardSceneKey !== expectedSceneKey) {
      return {
        message: `expected the WhiteboardTopic scene key ${JSON.stringify(expectedSceneKey)}`,
        path: ['entry', 'whiteboardSceneKey'],
      }
    }
    return undefined
  }
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
export type LoroWhiteboardTopic = typeof LoroWhiteboardTopicSchema.Type
export type LoroTopicValidation = Effect.Effect<LoroTopic, Schema.SchemaError>

/** Validates unknown Topic JSON and retains all schema issues in Effect's error channel. */
export function validateLoroTopic(input: unknown): LoroTopicValidation {
  return Schema.decodeUnknownEffect(LoroTopicSchema)(input, strictParseOptions)
}

/** Returns whether an unknown value has the complete Loro Topic structure. */
export function isLoroTopic(input: unknown): input is LoroTopic {
  return Exit.isSuccess(Schema.decodeUnknownExit(LoroTopicSchema)(input, strictParseOptions))
}
