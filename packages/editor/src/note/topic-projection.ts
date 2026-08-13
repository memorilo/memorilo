import type { NodeJSON } from 'prosekit/core'

export interface TopicBlockProjection {
  attributes: Readonly<Record<string, unknown>>
  id: string
  kind: string
  ordinal: number
  parentId: string | null
  text: string
}

export interface TopicContentProjection {
  blocks: readonly TopicBlockProjection[]
  /** The effective title projected from the Topic's explicit title and content. */
  title: string
  topicId: string
}

const blockSeparators = new Set([
  'blockquote',
  'codeBlock',
  'heading',
  'paragraph',
  'tableCell',
  'tableHeader',
  'tableRow',
])

function appendNodeText(node: NodeJSON, output: string[]): void {
  if (node.type === 'list')
    return
  if (node.text !== undefined) {
    output.push(node.text)
    return
  }
  if (node.type === 'hardBreak') {
    output.push('\n')
    return
  }
  if (node.type === 'tag') {
    const label = node.attrs?.label
    if (typeof label === 'string')
      output.push(`#${label}`)
    return
  }
  if (node.type === 'image') {
    const alt = node.attrs?.alt
    if (typeof alt === 'string')
      output.push(alt)
    return
  }

  node.content?.forEach((child) => {
    appendNodeText(child, output)
    if (blockSeparators.has(child.type))
      output.push('\n')
  })
}

function ownText(node: NodeJSON): string {
  const output: string[] = []
  node.content?.forEach(child => appendNodeText(child, output))
  return output.join('').replace(/[\t ]*\n[\t ]*/gu, '\n').trim()
}

function readBlockId(node: NodeJSON): string {
  const id = node.attrs?.blockId
  if (typeof id !== 'string' || id.length === 0)
    throw new Error('Topic blocks require a stable blockId')
  return id
}

function readBlockKind(node: NodeJSON): string {
  const kind = node.attrs?.kind
  if (typeof kind !== 'string' || kind.length === 0)
    throw new Error(`Topic block ${readBlockId(node)} requires a kind`)
  return kind
}

export function projectTopicBlocks(document: NodeJSON): readonly TopicBlockProjection[] {
  if (document.type !== 'doc')
    throw new TypeError(`Expected a doc node, received ${document.type}`)

  const blocks: TopicBlockProjection[] = []
  const visit = (node: NodeJSON, parentId: string | null, ordinal: number): void => {
    if (node.type !== 'list')
      throw new TypeError(`Expected a normalized list block, received ${node.type}`)
    const id = readBlockId(node)
    blocks.push({
      attributes: node.attrs ? structuredClone(node.attrs) : {},
      id,
      kind: readBlockKind(node),
      ordinal,
      parentId,
      text: ownText(node),
    })

    const children = node.content?.filter(child => child.type === 'list') ?? []
    children.forEach((child, childOrdinal) => visit(child, id, childOrdinal))
  }

  const roots = document.content ?? []
  roots.forEach((node, ordinal) => visit(node, null, ordinal))
  return blocks
}

/** Projects a normalized Topic document without requiring any CRDT runtime. */
export function projectTopicContent(
  document: NodeJSON,
  topicId: string,
  explicitTitle: string,
): TopicContentProjection {
  const blocks = projectTopicBlocks(document)
  const firstBlock = blocks.at(0)
  const title = explicitTitle.length > 0
    ? explicitTitle
    : firstBlock?.text.split(/\r?\n/u, 1)[0]?.trim() ?? ''
  return { blocks, title, topicId }
}
