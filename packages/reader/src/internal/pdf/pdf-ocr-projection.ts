import type { ReaderOcrResult, ReaderOcrTextItem } from '../../types'

export function validatePdfOcrResult(result: ReaderOcrResult): void {
  for (const [index, item] of result.items.entries()) {
    if (!item.text.trim())
      throw new Error(`OCR text item ${index} must contain text`)
    const { height, width, x, y } = item.rect
    const values = [height, width, x, y]
    if (values.some(value => !Number.isFinite(value)))
      throw new Error(`OCR text item ${index} contains a non-finite rectangle`)
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1)
      throw new Error(`OCR text item ${index} must use a normalized rectangle`)
  }
}

export function pdfCanvasBlob(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    canvas.toBlob((blob) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      if (!blob) {
        reject(new Error('Unable to create a PDF page image for OCR'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

export function projectPdfOcrItems(
  layer: HTMLDivElement,
  items: readonly ReaderOcrTextItem[],
  renderedHeight: number,
): void {
  layer.classList.add('reader-pdf-text-layer-ocr')
  for (const item of items) {
    const span = document.createElement('span')
    span.textContent = item.text
    span.style.left = `${item.rect.x * 100}%`
    span.style.top = `${item.rect.y * 100}%`
    span.style.width = `${item.rect.width * 100}%`
    span.style.height = `${item.rect.height * 100}%`
    const itemHeight = Math.max(1, item.rect.height * renderedHeight)
    span.style.fontSize = `${itemHeight}px`
    span.style.lineHeight = `${itemHeight}px`
    layer.append(span)
  }
}
