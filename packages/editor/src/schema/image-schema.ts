import { defineNodeAttr } from 'prosekit/core'

export interface MemoriloImageAttrs {
  height?: number | null
  imageId?: string | null
  src?: string | null
  width?: number | null
}

function validateImageId(value: unknown): void {
  if (value !== null && (typeof value !== 'string' || value.length === 0))
    throw new TypeError('An imageId must be a non-empty string or null')
}

export function defineImageIdAttr() {
  return defineNodeAttr<'image', 'imageId', string | null>({
    attr: 'imageId',
    default: null,
    parseDOM: element => element.getAttribute('data-image-id'),
    splittable: false,
    toDOM: value => value ? ['data-image-id', value] : null,
    type: 'image',
    validate: validateImageId,
  })
}
