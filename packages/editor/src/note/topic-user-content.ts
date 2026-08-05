import type { NodeJSON } from 'prosekit/core'
import type { ProseMirrorNode } from 'prosekit/pm/model'
import { normalizeOutlineDocument } from '../common/outline-document'
import { topicProseMirrorSchema } from '../schema/topic-prosemirror-schema'

const CANONICAL_EMPTY_BLOCK_ID = 'canonical-empty-topic-block'
const emptyIgnoredAttributes = new Set<string>()
const ignoredBlockAttributes = new Set(['blockId', 'collapsed'])
const structurallyEmptyNodeTypes = new Set([
  'blockquote',
  'doc',
  'hardBreak',
  'heading',
  'list',
  'paragraph',
  'text',
])

function createCanonicalEmptyDocument() {
  const document = topicProseMirrorSchema.nodeFromJSON(normalizeOutlineDocument({
    content: [{ type: 'paragraph' }],
    type: 'doc',
  }, () => CANONICAL_EMPTY_BLOCK_ID))
  const block = document.firstChild
  const paragraph = block?.firstChild

  if (!block || !paragraph)
    throw new Error('The Topic schema cannot represent the canonical empty document')
  return { block, paragraph }
}

const {
  block: canonicalEmptyBlock,
  paragraph: canonicalEmptyParagraph,
} = createCanonicalEmptyDocument()

function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right))
    return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length)
      return false
    return left.every((value, index) => equalValue(value, right[index]))
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => Object.prototype.hasOwnProperty.call(rightRecord, key)
      && equalValue(leftRecord[key], rightRecord[key]))
}

function equalAttributes(
  actual: Readonly<Record<string, unknown>>,
  canonical: Readonly<Record<string, unknown>>,
  ignored: ReadonlySet<string> = emptyIgnoredAttributes,
): boolean {
  const actualKeys = Object.keys(actual).filter(key => !ignored.has(key))
  const canonicalKeys = Object.keys(canonical).filter(key => !ignored.has(key))
  return actualKeys.length === canonicalKeys.length
    && actualKeys.every(key => Object.prototype.hasOwnProperty.call(canonical, key)
      && equalValue(actual[key], canonical[key]))
}

function hasMeaningfulAttributes(node: ProseMirrorNode): boolean {
  if (node.type.name === 'list')
    return !equalAttributes(node.attrs, canonicalEmptyBlock.attrs, ignoredBlockAttributes)
  if (node.type.name === 'paragraph')
    return !equalAttributes(node.attrs, canonicalEmptyParagraph.attrs)
  if (node.type.name === 'heading')
    return false
  return Object.keys(node.attrs).length > 0
}

/** Reports whether a valid Topic document contains semantic user content. */
export function hasTopicUserContent(document: NodeJSON): boolean {
  const candidate = topicProseMirrorSchema.nodeFromJSON(document)
  candidate.check()

  const visit = (node: typeof candidate): boolean => {
    if (!structurallyEmptyNodeTypes.has(node.type.name))
      return true
    if (hasMeaningfulAttributes(node))
      return true
    if (node.isText) {
      if (node.text === undefined)
        throw new Error('The Topic schema produced a text node without text')
      return node.text.trim().length > 0
    }

    let hasContent = false
    node.forEach((child) => {
      if (!hasContent && visit(child))
        hasContent = true
    })
    return hasContent
  }

  return visit(candidate)
}
