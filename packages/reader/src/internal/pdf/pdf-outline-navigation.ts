import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ReaderOutlineItem } from '../../types'
import type { ReaderOutlineSource } from '../reader-outline'
import { ReaderOutlineProjection } from '../reader-outline'

interface PdfReference {
  gen: number
  num: number
}

export interface PdfOutlineNode {
  dest: string | unknown[] | null
  items: PdfOutlineNode[]
  title: string
}

type PdfDestination = string | readonly unknown[]

function missingPdfOutlineDestination(outlineItemId: string): Error {
  return new Error(`PDF outline item ${outlineItemId} does not have a document destination`)
}

function isPdfReference(value: unknown): value is PdfReference {
  if (typeof value !== 'object' || value === null)
    return false
  const candidate = value as Partial<PdfReference>
  return typeof candidate.num === 'number' && typeof candidate.gen === 'number'
}

export class PdfOutlineNavigation {
  private projection = new ReaderOutlineProjection<PdfDestination>(
    'pdf',
    [],
    missingPdfOutlineDestination,
  )

  get items(): readonly ReaderOutlineItem[] {
    return this.projection.items
  }

  load(nodes: PdfOutlineNode[] | null): void {
    const convert = (items: PdfOutlineNode[]): ReaderOutlineSource<PdfDestination>[] => items.map((item) => {
      const source = {
        children: convert(item.items),
        label: item.title.trim() || 'Untitled section',
      }
      return item.dest === null
        ? { ...source, navigable: false }
        : { ...source, navigable: true, target: item.dest }
    })
    this.projection = new ReaderOutlineProjection(
      'pdf',
      convert(nodes ?? []),
      missingPdfOutlineDestination,
    )
  }

  async pageNumber(outlineItemId: string, document: PDFDocumentProxy): Promise<number> {
    const destinationValue = this.projection.requireTarget(outlineItemId)
    const destination = typeof destinationValue === 'string'
      ? await document.getDestination(destinationValue)
      : destinationValue
    const pageReference = destination?.[0]
    if (pageReference === undefined || pageReference === null)
      throw new Error(`PDF outline item ${outlineItemId} has an invalid destination`)
    const pageIndex = typeof pageReference === 'number'
      ? pageReference
      : isPdfReference(pageReference)
        ? await document.getPageIndex(pageReference)
        : undefined
    if (pageIndex === undefined || pageIndex < 0 || pageIndex >= document.numPages)
      throw new Error(`PDF outline item ${outlineItemId} points outside the document`)
    return pageIndex + 1
  }
}
