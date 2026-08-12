import { vi } from 'vitest'

export class FakeElement {
  readonly children: FakeElement[] = []
  readonly dataset: Record<string, string> = {}
  readonly style: Record<string, string> = {}
  clientHeight = 480
  clientWidth = 640
  parent: FakeElement | null = null
  removeFailures = 0
  scrollHeight = 480
  scrollLeft = 0
  scrollTop = 0
  scrollWidth = 640
  className = ''
  private readonly listeners = new Map<string, EventListener>()

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener)
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent?.detach(node)
      node.parent = this
      this.children.push(node)
    }
  }

  contains(node: FakeElement): boolean {
    return node === this || node.parent === this || this.children.some(child => child.contains(node))
  }

  detach(node: FakeElement): void {
    const index = this.children.indexOf(node)
    if (index >= 0) {
      this.children.splice(index, 1)
      node.parent = null
    }
  }

  getBoundingClientRect(): DOMRect {
    return { bottom: 480, height: 480, left: 0, right: 640, top: 0, width: 640 } as DOMRect
  }

  querySelector<T extends FakeElement>(selector: string): T | null {
    const annotationId = /^\[data-annotation-id="([^"]+)"\]$/.exec(selector)?.[1]
    if (annotationId && this.dataset.annotationId === annotationId)
      return this as unknown as T
    for (const child of this.children) {
      const match = child.querySelector<T>(selector)
      if (match)
        return match
    }
    return null
  }

  remove(): void {
    if (this.removeFailures > 0) {
      this.removeFailures -= 1
      throw new Error('page DOM removal failed')
    }
    this.parent?.detach(this)
  }

  removeEventListener(type: string, _listener: EventListener): void {
    this.listeners.delete(type)
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of this.children)
      child.parent = null
    this.children.length = 0
    this.append(...nodes)
  }

  replaceWith(node: FakeElement): void {
    const parent = this.parent
    if (!parent)
      throw new Error('Cannot replace a detached page')
    const index = parent.children.indexOf(this)
    if (index < 0)
      throw new Error('Cannot replace an unknown page')
    node.parent?.detach(node)
    node.parent = parent
    parent.children[index] = node
    this.parent = null
  }

  scrollIntoView(): void {}

  setAttribute(name: string, value: string): void {
    if (name === 'data-annotation-id')
      this.dataset.annotationId = value
  }

  scrollTo(): void {}
}

export class FakeImage extends FakeElement {
  decoding = 'async'
  naturalHeight = 480
  naturalWidth = 640
  private source = ''

  get src(): string {
    return this.source
  }

  set src(value: string) {
    this.source = value
  }

  decode(): Promise<void> {
    return Promise.resolve()
  }
}

export function installComicDom(): { container: FakeElement, revoke: ReturnType<typeof vi.fn> } {
  const container = new FakeElement()
  const revoke = vi.fn()
  vi.stubGlobal('document', { createElement: vi.fn(() => new FakeElement()) })
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn((() => {
      let index = 0
      return () => `blob:comic-${++index}`
    })()),
    revokeObjectURL: revoke,
  })
  vi.stubGlobal('ResizeObserver', class FakeResizeObserver {
    disconnect(): void {}
    observe(): void {}
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
  vi.stubGlobal('CSS', { escape: (value: string) => value })
  return { container, revoke }
}
