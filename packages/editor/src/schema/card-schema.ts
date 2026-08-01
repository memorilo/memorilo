import type { Extension, Union } from 'prosekit/core'
import type {
  CardBlockAttrs,
  CardDelimiterAttrs,
  ClozeMarkAttrs,
  HighlightColor,
  InlineHighlightMarkAttrs,
} from '../card/card-model'
import { defineMarkSpec, defineNodeAttr, defineNodeSpec, union } from 'prosekit/core'

type CardDelimiterSpecExtension = Extension<{
  Nodes: {
    cardDelimiter: CardDelimiterAttrs
  }
}>

type ClozeSpecExtension = Extension<{
  Marks: {
    cloze: ClozeMarkAttrs
  }
}>

type InlineHighlightSpecExtension = Extension<{
  Marks: {
    inlineHighlight: InlineHighlightMarkAttrs
  }
}>

type CardBlockAttrsExtension = Extension<{
  Nodes: {
    list: CardBlockAttrs
  }
}>

export type CardSchemaExtension = Union<[
  CardDelimiterSpecExtension,
  ClozeSpecExtension,
  InlineHighlightSpecExtension,
  CardBlockAttrsExtension,
]>

export function validateRequiredId(value: unknown): void {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError('Card IDs must be non-empty strings')
}

export function validateOptionalId(value: unknown): void {
  if (value !== null)
    validateRequiredId(value)
}

export function validateDirection(value: unknown): void {
  if (value !== 'forward' && value !== 'backward' && value !== 'both' && value !== 'disabled')
    throw new TypeError(`Unsupported Card direction: ${String(value)}`)
}

export function validateAnchorKind(value: unknown): void {
  if (value !== 'rich-content' && value !== 'math-source')
    throw new TypeError(`Unsupported Cloze anchor kind: ${String(value)}`)
}

export function validateHighlightColor(value: unknown): void {
  if (value !== 'yellow' && value !== 'green' && value !== 'blue' && value !== 'pink' && value !== 'orange' && value !== 'purple')
    throw new TypeError(`Unsupported Highlight color: ${String(value)}`)
}

function validateOptionalHighlightColor(value: unknown): void {
  if (value !== null)
    validateHighlightColor(value)
}

export function directionSymbol(direction: CardDelimiterAttrs['direction']): string {
  if (direction === 'forward')
    return '→'
  if (direction === 'backward')
    return '←'
  if (direction === 'both')
    return '↔'
  return '—'
}

function defineCardDelimiterSpec(): CardDelimiterSpecExtension {
  return defineNodeSpec<'cardDelimiter', CardDelimiterAttrs>({
    name: 'cardDelimiter',
    atom: true,
    attrs: {
      backwardCardId: { default: null, validate: validateOptionalId },
      definitionId: { validate: validateRequiredId },
      direction: { validate: validateDirection },
      forwardCardId: { default: null, validate: validateOptionalId },
    },
    group: 'inline',
    inline: true,
    leafText: node => directionSymbol((node.attrs as CardDelimiterAttrs).direction),
    parseDOM: [{
      tag: 'span[data-card-delimiter]',
      getAttrs: (dom) => {
        const definitionId = dom.getAttribute('data-card-definition-id')
        const direction = dom.getAttribute('data-card-direction')
        if (!definitionId || !direction)
          return false
        validateDirection(direction)
        return {
          backwardCardId: dom.getAttribute('data-backward-card-id') || null,
          definitionId,
          direction,
          forwardCardId: dom.getAttribute('data-forward-card-id') || null,
        }
      },
    }],
    selectable: true,
    toDOM(node) {
      const attrs = node.attrs as CardDelimiterAttrs
      return ['span', {
        'data-backward-card-id': attrs.backwardCardId ?? '',
        'data-card-definition-id': attrs.definitionId,
        'data-card-delimiter': '',
        'data-card-direction': attrs.direction,
        'data-forward-card-id': attrs.forwardCardId ?? '',
      }, directionSymbol(attrs.direction)]
    },
  })
}

function defineClozeSpec(): ClozeSpecExtension {
  return defineMarkSpec<'cloze', ClozeMarkAttrs>({
    name: 'cloze',
    attrs: {
      anchorKind: { validate: validateAnchorKind },
      cardId: { validate: validateRequiredId },
      definitionId: { validate: validateRequiredId },
      groupId: { validate: validateRequiredId },
    },
    inclusive: false,
    parseDOM: [{
      tag: 'span[data-cloze-group-id]',
      getAttrs: (dom) => {
        const anchorKind = dom.getAttribute('data-cloze-anchor-kind')
        const cardId = dom.getAttribute('data-cloze-card-id')
        const definitionId = dom.getAttribute('data-cloze-definition-id')
        const groupId = dom.getAttribute('data-cloze-group-id')
        if (!anchorKind || !cardId || !definitionId || !groupId)
          return false
        validateAnchorKind(anchorKind)
        return { anchorKind, cardId, definitionId, groupId }
      },
    }],
    toDOM(mark) {
      const attrs = mark.attrs as ClozeMarkAttrs
      return ['span', {
        'data-cloze-anchor-kind': attrs.anchorKind,
        'data-cloze-card-id': attrs.cardId,
        'data-cloze-definition-id': attrs.definitionId,
        'data-cloze-group-id': attrs.groupId,
      }, 0]
    },
  })
}

function defineInlineHighlightSpec(): InlineHighlightSpecExtension {
  return defineMarkSpec<'inlineHighlight', InlineHighlightMarkAttrs>({
    name: 'inlineHighlight',
    attrs: {
      color: { validate: validateHighlightColor },
    },
    parseDOM: [{
      tag: 'mark[data-inline-highlight]',
      getAttrs: (dom) => {
        const color = dom.getAttribute('data-inline-highlight')
        if (!color)
          return false
        validateHighlightColor(color)
        return { color }
      },
    }],
    toDOM(mark) {
      const attrs = mark.attrs as InlineHighlightMarkAttrs
      return ['mark', { 'data-inline-highlight': attrs.color }, 0]
    },
  })
}

function defineCardBlockAttrs(): CardBlockAttrsExtension {
  return union(
    defineNodeAttr<'list', 'blockHighlight', HighlightColor | null>({
      type: 'list',
      attr: 'blockHighlight',
      default: null,
      splittable: false,
      validate: validateOptionalHighlightColor,
      toDOM: value => value ? ['data-block-highlight', value] : null,
      parseDOM: (element) => {
        const color = element.getAttribute('data-block-highlight')
        if (color === null)
          return null
        validateHighlightColor(color)
        return color as HighlightColor
      },
    }),
    defineNodeAttr<'list', 'cardItemDefinitionId', string | null>({
      type: 'list',
      attr: 'cardItemDefinitionId',
      default: null,
      splittable: true,
      validate: validateOptionalId,
      toDOM: value => value ? ['data-card-item-definition-id', value] : null,
      parseDOM: element => element.getAttribute('data-card-item-definition-id'),
    }),
  )
}

export function defineCardSchema(): CardSchemaExtension {
  return union(
    defineCardDelimiterSpec(),
    defineClozeSpec(),
    defineInlineHighlightSpec(),
    defineCardBlockAttrs(),
  )
}
