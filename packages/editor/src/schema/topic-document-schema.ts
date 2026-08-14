import type { SchemaAST } from 'effect'
import { Option, Schema, SchemaIssue } from 'effect'
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

export const strictTopicParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
} as const

export const TopicAttributesSchema = Schema.Record(Schema.String, Schema.Unknown)
const MarkSchema = Schema.Struct({
  attrs: Schema.optionalKey(TopicAttributesSchema),
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
  attrs: Schema.optionalKey(TopicAttributesSchema),
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
  const imageIds = new Set<string>()
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
      case 'tag':
        break
      case 'image': {
        const imageId = node.attrs?.imageId
        if (imageId !== null && imageId !== undefined) {
          if (typeof imageId !== 'string' || imageId.length === 0)
            addIssue([...path, 'attrs', 'imageId'], imageId, 'expected a non-empty imageId or null')
          else if (imageIds.has(imageId))
            addIssue([...path, 'attrs', 'imageId'], imageId, `duplicate imageId: ${imageId}`)
          else
            imageIds.add(imageId)
        }
        break
      }
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
  attrs: Schema.optionalKey(TopicAttributesSchema),
  content: Schema.optionalKey(Schema.Array(LoroTopicNodeSchema)),
  type: Schema.Literal('doc'),
}).check(Schema.makeFilter(validateTopicDocument, {
  expected: 'a normalized Topic document with unique blocks',
}))
