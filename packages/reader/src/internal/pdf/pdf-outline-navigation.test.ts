import type { PDFDocumentProxy } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import { PdfOutlineNavigation } from './pdf-outline-navigation'

function pdfDocument(
  overrides: Partial<Pick<PDFDocumentProxy, 'getDestination' | 'getPageIndex' | 'numPages'>> = {},
): PDFDocumentProxy {
  return {
    getDestination: vi.fn(async () => null),
    getPageIndex: vi.fn(async () => 0),
    numPages: 4,
    ...overrides,
  } as PDFDocumentProxy
}

describe('pdf outline navigation', () => {
  it('projects nested groups while retaining navigable targets', async () => {
    const navigation = new PdfOutlineNavigation()
    navigation.load([{
      dest: null,
      items: [{ dest: [2], items: [], title: '  Chapter  ' }],
      title: '   ',
    }])

    expect(navigation.items).toEqual([{
      children: [{
        children: [],
        href: undefined,
        id: 'pdf.0.0',
        label: 'Chapter',
        navigable: true,
      }],
      href: undefined,
      id: 'pdf.0',
      label: 'Untitled section',
      navigable: false,
    }])
    await expect(navigation.pageNumber('pdf.0', pdfDocument())).rejects.toThrow(
      'PDF outline item pdf.0 does not have a document destination',
    )
    await expect(navigation.pageNumber('pdf.0.0', pdfDocument())).resolves.toBe(3)
  })

  it('resolves named destinations and PDF object references', async () => {
    const navigation = new PdfOutlineNavigation()
    const reference = { gen: 0, num: 17 }
    navigation.load([
      { dest: 'chapter', items: [], title: 'Named' },
      { dest: [reference], items: [], title: 'Reference' },
    ])
    const document = pdfDocument({
      getDestination: vi.fn(async name => name === 'chapter' ? [1] : null),
      getPageIndex: vi.fn(async candidate => candidate === reference ? 3 : -1),
    })

    await expect(navigation.pageNumber('pdf.0', document)).resolves.toBe(2)
    await expect(navigation.pageNumber('pdf.1', document)).resolves.toBe(4)
  })

  it('rejects invalid and out-of-range destinations', async () => {
    const navigation = new PdfOutlineNavigation()
    navigation.load([
      { dest: [], items: [], title: 'Missing' },
      { dest: [{}], items: [], title: 'Invalid' },
      { dest: [4], items: [], title: 'Outside' },
    ])
    const document = pdfDocument()

    await expect(navigation.pageNumber('pdf.0', document)).rejects.toThrow(
      'PDF outline item pdf.0 has an invalid destination',
    )
    await expect(navigation.pageNumber('pdf.1', document)).rejects.toThrow(
      'PDF outline item pdf.1 points outside the document',
    )
    await expect(navigation.pageNumber('pdf.2', document)).rejects.toThrow(
      'PDF outline item pdf.2 points outside the document',
    )
  })
})
