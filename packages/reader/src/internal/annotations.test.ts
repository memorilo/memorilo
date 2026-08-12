import { describe, expect, it, vi } from 'vitest'
import { AnnotationActivationOwner } from './annotations'

interface ActivationHarness {
  click: (event: Event) => void
  contains: ReturnType<typeof vi.fn>
  marker: HTMLElement
  removeEventListener: ReturnType<typeof vi.fn>
  root: HTMLElement
}

function activationHarness(annotationId = 'annotation'): ActivationHarness {
  let click: EventListener | undefined
  const marker = { dataset: { annotationId } } as unknown as HTMLElement
  const contains = vi.fn((candidate: Node) => candidate === marker)
  const removeEventListener = vi.fn()
  const root = {
    addEventListener: vi.fn((_type: string, listener: EventListener) => {
      click = listener
    }),
    contains,
    removeEventListener,
  } as unknown as HTMLElement
  return {
    click: (event) => {
      if (!click)
        throw new Error('Annotation click listener was not installed')
      click(event)
    },
    contains,
    marker,
    removeEventListener,
    root,
  }
}

describe('annotation activation owner', () => {
  it('delegates a nested marker click and closes idempotently', () => {
    const harness = activationHarness()
    const activate = vi.fn()
    const owner = new AnnotationActivationOwner(harness.root, activate)
    const target = {
      closest: vi.fn(() => harness.marker),
    }

    harness.click({ target } as unknown as Event)
    expect(activate).toHaveBeenCalledWith('annotation')

    owner.close()
    owner.close()
    expect(harness.removeEventListener).toHaveBeenCalledOnce()
  })

  it('ignores foreign markers and activation while the caller is not ready', () => {
    const harness = activationHarness()
    const activate = vi.fn()
    let ready = false
    const owner = new AnnotationActivationOwner(harness.root, activate, {
      canActivate: () => ready,
    })
    const target = { closest: vi.fn(() => harness.marker) }

    harness.click({ target } as unknown as Event)
    ready = true
    harness.contains.mockReturnValue(false)
    harness.click({ target } as unknown as Event)

    expect(activate).not.toHaveBeenCalled()
    owner.close()
  })
})
