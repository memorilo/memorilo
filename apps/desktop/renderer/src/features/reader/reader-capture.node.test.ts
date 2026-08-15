import { describe, expect, it, vi } from 'vitest'
import { captureReaderAnnotationRegion } from './reader-capture'

interface FakeStyle {
  getPropertyPriority: (name: string) => string
  getPropertyValue: (name: string) => string
  removeProperty: (name: string) => void
  setProperty: (name: string, value: string, priority?: string) => void
}

function style(): FakeStyle {
  const values = new Map<string, { priority: string, value: string }>()
  return {
    getPropertyPriority: name => values.get(name)?.priority ?? '',
    getPropertyValue: name => values.get(name)?.value ?? '',
    removeProperty: name => values.delete(name),
    setProperty: (name, value, priority = '') => values.set(name, { priority, value }),
  }
}

function element(attributes: Record<string, string>, initialVisibility = '') {
  const elementStyle = style()
  if (initialVisibility)
    elementStyle.setProperty('visibility', initialVisibility)
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
    hasAttribute: (name: string) => attributes[name] !== undefined,
    style: elementStyle,
  }
}

describe('reader region capture', () => {
  it('hides Reader overlays only while capturing and restores them afterwards', async () => {
    const annotation = element({ 'data-annotation-id': 'annotation-1' }, 'visible')
    const connector = element({ 'data-reader-capture-overlay': 'true' })
    const unrelated = element({ 'data-annotation-id': 'annotation-2' }, 'visible')
    const highlight = element({ 'data-highlight-id': 'annotation-2' }, 'visible')
    const iframeAnnotation = element({ 'data-annotation-id': 'annotation-3' }, 'visible')
    const iframeHighlight = element({ 'data-highlight-id': 'annotation-3' }, 'visible')
    const iframeDocument = {
      querySelectorAll: () => [iframeAnnotation, iframeHighlight],
    }
    const elements = [annotation, connector, unrelated, highlight]
    const capturedElements = [...elements, iframeAnnotation, iframeHighlight]
    let capturedVisibility: string[] = []
    const captureReaderRegion = vi.fn(async () => {
      capturedVisibility = capturedElements.map(item => item.style.getPropertyValue('visibility'))
      return Uint8Array.from([137, 80, 78, 71])
    })

    await captureReaderAnnotationRegion({
      captureReaderRegion,
      documentRef: {
        childDocuments: () => [iframeDocument],
        querySelectorAll: () => elements,
      },
      region: { height: 20, width: 30, x: 10, y: 5 },
      waitForPaint: async () => undefined,
    })

    expect(capturedVisibility).toEqual(['hidden', 'hidden', 'hidden', 'hidden', 'hidden', 'hidden'])
    expect(annotation.style.getPropertyValue('visibility')).toBe('visible')
    expect(connector.style.getPropertyValue('visibility')).toBe('')
    expect(unrelated.style.getPropertyValue('visibility')).toBe('visible')
    expect(highlight.style.getPropertyValue('visibility')).toBe('visible')
    expect(iframeAnnotation.style.getPropertyValue('visibility')).toBe('visible')
    expect(iframeHighlight.style.getPropertyValue('visibility')).toBe('visible')
  })

  it('keeps shared overlays hidden until every concurrent capture finishes', async () => {
    const annotation = element({ 'data-annotation-id': 'annotation-1' }, 'visible')
    const connector = element({ 'data-reader-capture-overlay': 'true' })
    const elements = [annotation, connector]
    let resolveFirst!: (value: Uint8Array) => void
    let resolveSecond!: (value: Uint8Array) => void
    const firstCapture = new Promise<Uint8Array>((resolve) => {
      resolveFirst = resolve
    })
    const secondCapture = new Promise<Uint8Array>((resolve) => {
      resolveSecond = resolve
    })
    const captureOptions = {
      documentRef: { querySelectorAll: () => elements },
      region: { height: 20, width: 30, x: 10, y: 5 },
      waitForPaint: async () => undefined,
    }

    const first = captureReaderAnnotationRegion({
      ...captureOptions,
      captureReaderRegion: () => firstCapture,
    })
    await vi.waitFor(() => expect(annotation.style.getPropertyValue('visibility')).toBe('hidden'))
    const second = captureReaderAnnotationRegion({
      ...captureOptions,
      captureReaderRegion: () => secondCapture,
    })
    await vi.waitFor(() => expect(connector.style.getPropertyValue('visibility')).toBe('hidden'))

    resolveFirst(Uint8Array.from([1]))
    await first
    expect(annotation.style.getPropertyValue('visibility')).toBe('hidden')
    expect(connector.style.getPropertyValue('visibility')).toBe('hidden')

    resolveSecond(Uint8Array.from([2]))
    await second
    expect(annotation.style.getPropertyValue('visibility')).toBe('visible')
    expect(connector.style.getPropertyValue('visibility')).toBe('')
  })
})
