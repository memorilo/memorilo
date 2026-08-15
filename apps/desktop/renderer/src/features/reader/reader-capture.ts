export interface ReaderCaptureRegion {
  height: number
  width: number
  x: number
  y: number
}

interface ReaderCaptureStyle {
  getPropertyPriority: (name: string) => string
  getPropertyValue: (name: string) => string
  removeProperty: (name: string) => void
  setProperty: (name: string, value: string, priority?: string) => void
}

interface ReaderCaptureElement {
  style: ReaderCaptureStyle
}

interface ReaderCaptureVisibilityLease {
  priority: string
  references: number
  value: string
}

const captureVisibilityLeases = new WeakMap<ReaderCaptureElement, ReaderCaptureVisibilityLease>()

export interface ReaderCaptureDocument {
  childDocuments?: () => Iterable<ReaderCaptureDocument>
  querySelectorAll: (selector: string) => Iterable<ReaderCaptureElement>
}

interface ReaderCaptureOptions {
  captureReaderRegion: (region: ReaderCaptureRegion) => Promise<Uint8Array>
  documentRef?: ReaderCaptureDocument
  region: ReaderCaptureRegion
  waitForPaint?: () => Promise<void>
}

function browserCaptureDocument(documentRef: Document): ReaderCaptureDocument {
  return {
    childDocuments: () => {
      const childDocuments: ReaderCaptureDocument[] = []
      for (const frame of documentRef.querySelectorAll('iframe')) {
        if (frame.contentDocument)
          childDocuments.push(browserCaptureDocument(frame.contentDocument))
      }
      return childDocuments
    },
    querySelectorAll: selector => documentRef.querySelectorAll<HTMLElement | SVGElement>(selector),
  }
}

function defaultDocument(): ReaderCaptureDocument | undefined {
  return typeof document === 'undefined' ? undefined : browserCaptureDocument(document)
}

function defaultWaitForPaint(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function')
    return Promise.resolve()
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function hideForReaderCapture(element: ReaderCaptureElement): void {
  const existing = captureVisibilityLeases.get(element)
  if (existing) {
    existing.references += 1
    return
  }
  const lease = {
    priority: element.style.getPropertyPriority('visibility'),
    references: 1,
    value: element.style.getPropertyValue('visibility'),
  }
  element.style.setProperty('visibility', 'hidden', 'important')
  captureVisibilityLeases.set(element, lease)
}

function restoreAfterReaderCapture(element: ReaderCaptureElement): void {
  const lease = captureVisibilityLeases.get(element)
  if (!lease)
    throw new Error('Reader capture visibility lease is missing')
  lease.references -= 1
  if (lease.references > 0)
    return
  captureVisibilityLeases.delete(element)
  if (lease.value)
    element.style.setProperty('visibility', lease.value, lease.priority)
  else
    element.style.removeProperty('visibility')
}

export async function captureReaderAnnotationRegion({
  captureReaderRegion,
  documentRef = defaultDocument(),
  region,
  waitForPaint = defaultWaitForPaint,
}: ReaderCaptureOptions): Promise<Uint8Array> {
  const hidden = new Set<ReaderCaptureElement>()
  const collectCaptureElements = (current: ReaderCaptureDocument): void => {
    for (const element of current.querySelectorAll(
      '[data-annotation-id], [data-highlight-id], [data-reader-capture-overlay]',
    )) {
      hidden.add(element)
    }
    for (const child of current.childDocuments?.() ?? [])
      collectCaptureElements(child)
  }
  if (documentRef)
    collectCaptureElements(documentRef)

  const acquired: ReaderCaptureElement[] = []
  try {
    for (const element of hidden) {
      hideForReaderCapture(element)
      acquired.push(element)
    }
    await waitForPaint()
    return await captureReaderRegion(region)
  }
  finally {
    for (const element of acquired.reverse())
      restoreAfterReaderCapture(element)
  }
}
