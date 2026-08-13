import type { ShelfPage } from './model'
import { parseOpds2 } from './opds2-parser'
import { parseOpdsAtom } from './opds-atom-parser'

export function parseShelfPage(value: string, contentType: string, requestUrl: string): ShelfPage {
  return contentType.includes('json') || value.trimStart().startsWith('{')
    ? parseOpds2(JSON.parse(value), requestUrl)
    : parseOpdsAtom(value, requestUrl)
}
