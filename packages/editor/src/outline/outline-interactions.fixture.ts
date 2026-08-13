import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import { expect } from 'vitest'

export const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    search: async () => [],
    create: async tag => tag,
    update: async tag => tag,
  },
}

export const outlineListKindCases = [
  { kind: 'outline', order: null },
  { kind: 'bullet', order: null },
  { kind: 'ordered', order: 4 },
  { kind: 'task', order: null },
  { kind: 'toggle', order: null },
] as const

export const outlineBodyCases: Array<{ body: NodeJSON, name: string, selector: string }> = [
  {
    body: {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Heading target' }],
    },
    name: 'heading',
    selector: 'h2',
  },
  {
    body: {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote target' }] }],
    },
    name: 'blockquote',
    selector: 'blockquote p',
  },
  {
    body: {
      type: 'codeBlock',
      attrs: { language: 'javascript' },
      content: [{ type: 'text', text: 'const target = true' }],
    },
    name: 'code block',
    selector: 'pre[data-language]',
  },
  {
    body: {
      type: 'mathBlock',
      content: [{ type: 'text', text: 'x^2' }],
    },
    name: 'math block',
    selector: '.prosemirror-math-source code',
  },
  {
    body: {
      type: 'image',
      attrs: { src: 'memory://outline-image' },
    },
    name: 'image',
    selector: 'img[alt="upload preview"]',
  },
  {
    body: { type: 'horizontalRule' },
    name: 'horizontal rule',
    selector: 'hr',
  },
]

export function block(id: string, children: NodeJSON[] = [], kind = 'outline'): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind, order: null },
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: id }] },
      ...children,
    ],
  }
}

export function emptyBlock(id: string, children: NodeJSON[] = []): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind: 'outline', order: null },
    content: [
      { type: 'paragraph' },
      ...children,
    ],
  }
}

export function blockWithBody(id: string, body: NodeJSON, children: NodeJSON[] = [], kind = 'outline'): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind, order: null },
    content: [body, ...children],
  }
}

export function richSubtree(targetIsNested: boolean): NodeJSON[] {
  const target = blockWithBody('B', { type: 'paragraph', content: [{ type: 'text', text: 'Target B' }] }, [
    blockWithBody('C', {
      type: 'image',
      attrs: { src: 'memory://rich-subtree-image' },
    }, [
      blockWithBody('D', {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Basic front' },
          {
            type: 'cardDelimiter',
            attrs: {
              backwardCardId: null,
              definitionId: 'definition-rich-basic',
              direction: 'forward',
              forwardCardId: 'card-rich-basic',
            },
          },
          { type: 'text', text: 'Basic back' },
        ],
      }, [
        blockWithBody('E', {
          type: 'paragraph',
          content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Bold level E' }],
        }, [
          blockWithBody('F', {
            type: 'paragraph',
            content: [{
              type: 'text',
              marks: [{
                type: 'cloze',
                attrs: {
                  anchorKind: 'rich-content',
                  cardId: 'card-rich-cloze',
                  definitionId: 'definition-rich-cloze',
                  groupId: 'group-rich-cloze',
                },
              }],
              text: 'Cloze level F',
            }],
          }, [], 'bullet'),
        ], 'bullet'),
      ], 'bullet'),
    ], 'bullet'),
  ], 'bullet')
  const candidates = targetIsNested
    ? [block('A', [target], 'bullet')]
    : [block('A', [], 'bullet'), target]

  return [
    block('Root', [
      block('Level-1', [
        block('Level-2', candidates, 'bullet'),
      ], 'bullet'),
    ], 'bullet'),
  ]
}

export function listKindBlock(id: string, kind: 'outline' | 'bullet' | 'ordered' | 'task' | 'toggle', order: number | null): NodeJSON {
  const attrs = kind === 'task'
    ? {
        blockId: id,
        checked: false,
        collapsed: false,
        elapsedMs: 0,
        kind,
        order,
        startedAt: null,
        status: 'todo',
      }
    : { blockId: id, checked: false, collapsed: false, kind, order }
  return {
    type: 'list',
    attrs,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: id }] }],
  }
}

export function outlineDocument(): NodeJSON {
  return {
    type: 'doc',
    content: [
      block('P', [block('A'), block('B'), block('C'), block('D'), block('E')]),
      block('Q'),
    ],
  }
}

export function blockElement(container: HTMLElement, id: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
  if (!element)
    throw new Error(`Block ${id} was not rendered`)
  return element
}

export function expectRichSubtreeContent(container: HTMLElement): void {
  expect(blockElement(container, 'C').querySelector('img')).toHaveAttribute('src', 'memory://rich-subtree-image')
  expect(blockElement(container, 'D')).toHaveTextContent('Basic front')
  expect(blockElement(container, 'D')).toHaveTextContent('Basic back')
  expect(blockElement(container, 'D').querySelector('[data-card-delimiter]')).toMatchObject({
    dataset: {
      cardDefinitionId: 'definition-rich-basic',
      cardDirection: 'forward',
      forwardCardId: 'card-rich-basic',
    },
  })
  expect(blockElement(container, 'E').querySelector('strong')).toHaveTextContent('Bold level E')
  expect(blockElement(container, 'F').querySelector('[data-cloze-group-id="group-rich-cloze"]')).toMatchObject({
    dataset: {
      clozeAnchorKind: 'rich-content',
      clozeCardId: 'card-rich-cloze',
      clozeDefinitionId: 'definition-rich-cloze',
    },
    textContent: 'Cloze level F',
  })
}

export function marker(container: HTMLElement, id: string): HTMLElement {
  const element = blockElement(container, id).querySelector<HTMLElement>(':scope > .list-marker')
  if (!element)
    throw new Error(`Block ${id} has no marker`)
  return element
}

export function paragraph(container: HTMLElement, id: string): HTMLElement {
  const element = blockElement(container, id).querySelector<HTMLElement>('p')
  if (!element)
    throw new Error(`Block ${id} has no paragraph`)
  return element
}

export function selectedIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-outline-selected]'))
    .map((element) => {
      const id = element.dataset.blockId
      if (!id)
        throw new Error('Selected outline block is missing its blockId')
      return id
    })
}

export function parentBlockId(container: HTMLElement, id: string): string | null {
  return blockElement(container, id).parentElement?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null
}

export function outlineDepth(container: HTMLElement, id: string): number {
  let depth = 0
  let ancestor = blockElement(container, id).parentElement?.closest<HTMLElement>('.prosemirror-flat-list') ?? null
  while (ancestor) {
    depth += 1
    ancestor = ancestor.parentElement?.closest<HTMLElement>('.prosemirror-flat-list') ?? null
  }
  return depth
}

export function selectedDomBlockId(): string | null {
  const focusNode = document.getSelection()?.focusNode
  if (!focusNode)
    return null
  const focusElement = focusNode.nodeType === Node.ELEMENT_NODE ? focusNode as Element : focusNode.parentElement
  return focusElement?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null
}

export function table(): NodeJSON {
  const cell = (text: string): NodeJSON => ({
    type: 'tableCell',
    attrs: {},
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: [cell('A1'), cell('A2')] },
      { type: 'tableRow', content: [cell('B1'), cell('B2')] },
    ],
  }
}

export function selectedCellText(): string | null {
  const focusNode = document.getSelection()?.focusNode
  if (!focusNode)
    return null
  const focusElement = focusNode instanceof Element ? focusNode : focusNode.parentElement
  return focusElement?.closest('td')?.textContent ?? null
}
