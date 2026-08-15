// @vitest-environment jsdom

import type { EpubContinuousTextSection } from './epub-continuous-text-selection'
import { afterEach, describe, expect, it } from 'vitest'
import { projectEpubContinuousTextSelection } from './epub-continuous-text-selection'

function section(href: string, text: string): EpubContinuousTextSection {
  const content = document.createElement('section')
  content.dataset.href = href
  content.append(document.createTextNode(text))
  document.body.append(content)
  return { content, href, type: 'application/xhtml+xml' }
}

function sectionHref(node: Node): string | undefined {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  return element?.closest<HTMLElement>('[data-href]')?.dataset.href
}

afterEach(() => {
  delete (Range.prototype as Partial<Range>).getClientRects
  document.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe('continuous EPUB text selection', () => {
  it('creates one selection with one locator fragment per spine section', () => {
    const first = section('one.xhtml', 'Alpha')
    const second = section('two.xhtml', 'Beta')
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value(this: Range) {
        const start = sectionHref(this.startContainer)
        const end = sectionHref(this.endContainer)
        if (start === 'one.xhtml' && end === 'two.xhtml')
          return [new DOMRect(10, 20, 50, 12), new DOMRect(10, 60, 40, 12)] as unknown as DOMRectList
        return [new DOMRect(10, start === 'one.xhtml' ? 20 : 60, 40, 12)] as unknown as DOMRectList
      },
    })
    const range = document.createRange()
    range.setStart(first.content.firstChild!, 0)
    range.setEnd(second.content.firstChild!, 4)
    const selection = document.getSelection()!
    selection.addRange(range)

    const result = projectEpubContinuousTextSelection(
      selection,
      [first, second],
      new DOMRect(100, 200, 600, 1000),
    )

    expect(result).toEqual({
      clientRect: { height: 52, left: 110, top: 220, width: 50 },
      selection: {
        anchors: [
          expect.objectContaining({
            locator: expect.objectContaining({
              href: 'one.xhtml',
              locations: expect.objectContaining({ memoriloTextEnd: 5, memoriloTextStart: 0 }),
            }),
            quote: expect.objectContaining({ exact: 'Alpha' }),
          }),
          expect.objectContaining({
            locator: expect.objectContaining({
              href: 'two.xhtml',
              locations: expect.objectContaining({ memoriloTextEnd: 4, memoriloTextStart: 0 }),
            }),
            quote: expect.objectContaining({ exact: 'Beta' }),
          }),
        ],
        text: 'Alpha\nBeta',
        type: 'text',
      },
    })
  })
})
