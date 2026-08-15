// @vitest-environment jsdom

import type { PdfContinuousTextPage } from './pdf-continuous-text-selection'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { projectPdfContinuousTextSelection } from './pdf-continuous-text-selection'

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height)
}

function page(pageNumber: number, text: string, top: number): PdfContinuousTextPage {
  const pageSurface = document.createElement('div')
  const textLayer = document.createElement('div')
  textLayer.dataset.pageNumber = String(pageNumber)
  textLayer.append(document.createTextNode(text))
  pageSurface.append(textLayer)
  document.body.append(pageSurface)
  vi.spyOn(pageSurface, 'getBoundingClientRect').mockReturnValue(rect(0, top, 200, 100))
  return { kind: 'embedded', pageNumber, pageSurface, textLayer }
}

function pageNumberForNode(node: Node): number | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  const value = element?.closest<HTMLElement>('[data-page-number]')?.dataset.pageNumber
  return value === undefined ? null : Number(value)
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (Range.prototype as Partial<Range>).getClientRects
  document.body.replaceChildren()
  document.getSelection()?.removeAllRanges()
})

describe('continuous PDF text selection', () => {
  it('projects one cross-page range into one annotation selection with two anchors', () => {
    const firstPage = page(1, 'Alpha', 0)
    const secondPage = page(2, 'Beta', 120)
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value(this: Range) {
        const startPage = pageNumberForNode(this.startContainer)
        const endPage = pageNumberForNode(this.endContainer)
        if (startPage === 1 && endPage === 2)
          return [rect(10, 10, 50, 12), rect(10, 130, 40, 12)] as unknown as DOMRectList
        if (startPage === 1)
          return [rect(10, 10, 50, 12)] as unknown as DOMRectList
        if (startPage === 2)
          return [rect(10, 130, 40, 12)] as unknown as DOMRectList
        return [] as unknown as DOMRectList
      },
    })
    const range = document.createRange()
    range.setStart(firstPage.textLayer.firstChild!, 0)
    range.setEnd(secondPage.textLayer.firstChild!, 4)
    const selection = document.getSelection()!
    selection.addRange(range)

    const result = projectPdfContinuousTextSelection(selection, [secondPage, firstPage])

    expect(result).toEqual({
      clientRect: { height: 132, left: 10, top: 10, width: 50 },
      selection: {
        anchors: [
          expect.objectContaining({
            format: 'pdf',
            pageNumber: 1,
            quote: expect.objectContaining({ exact: 'Alpha' }),
            rects: [{ height: 0.12, width: 0.25, x: 0.05, y: 0.1 }],
            source: 'embedded',
            type: 'text',
          }),
          expect.objectContaining({
            format: 'pdf',
            pageNumber: 2,
            quote: expect.objectContaining({ exact: 'Beta' }),
            rects: [{ height: 0.12, width: 0.2, x: 0.05, y: 0.1 }],
            source: 'embedded',
            type: 'text',
          }),
        ],
        text: 'Alpha\nBeta',
        type: 'text',
      },
    })
  })
})
