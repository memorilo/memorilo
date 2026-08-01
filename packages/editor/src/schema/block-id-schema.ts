import { defineNodeAttr } from 'prosekit/core'

function validateBlockId(value: unknown): void {
  if (value !== null && (typeof value !== 'string' || value.length === 0))
    throw new TypeError('A blockId must be a non-empty string or null')
}

export function defineBlockIdAttr() {
  return defineNodeAttr<'list', 'blockId', string | null>({
    type: 'list',
    attr: 'blockId',
    default: null,
    splittable: false,
    validate: validateBlockId,
    toDOM: value => value ? ['data-block-id', value] : null,
    parseDOM: node => node.getAttribute('data-block-id'),
  })
}
