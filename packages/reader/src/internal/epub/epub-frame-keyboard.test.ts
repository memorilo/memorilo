import { describe, expect, it, vi } from 'vitest'
import { EpubFrameKeyboardOwner } from './epub-frame-keyboard'

function frameHarness() {
  let keydown: EventListener | undefined
  const document = {
    addEventListener: vi.fn((_type: string, listener: EventListener) => {
      keydown = listener
    }),
    removeEventListener: vi.fn(),
  } as unknown as Document
  return {
    document,
    fire(event: KeyboardEvent) {
      if (!keydown)
        throw new Error('Frame keydown listener was not installed')
      keydown(event)
    },
    window: { document } as unknown as Window,
  }
}

function keyEvent(interactive = false): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: true,
    key: 'ArrowRight',
    metaKey: false,
    preventDefault: vi.fn(),
    repeat: false,
    shiftKey: true,
    stopPropagation: vi.fn(),
    target: { closest: vi.fn(() => interactive ? {} : null) },
  } as unknown as KeyboardEvent
}

describe('epub frame keyboard owner', () => {
  it('forwards a normalized key and consumes only accepted input', () => {
    const onKeyDown = vi.fn(() => true)
    const frame = frameHarness()
    const owner = new EpubFrameKeyboardOwner(onKeyDown)
    owner.observe(frame.window)
    const event = keyEvent()

    frame.fire(event)

    expect(onKeyDown).toHaveBeenCalledWith({
      altKey: false,
      ctrlKey: true,
      key: 'ArrowRight',
      metaKey: false,
      repeat: false,
      shiftKey: true,
    })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    owner.close()
  })

  it('ignores interactive targets and duplicate frame registration', () => {
    const onKeyDown = vi.fn(() => true)
    const frame = frameHarness()
    const owner = new EpubFrameKeyboardOwner(onKeyDown)

    owner.observe(frame.window)
    owner.observe(frame.window)
    frame.fire(keyEvent(true))

    expect(frame.document.addEventListener).toHaveBeenCalledOnce()
    expect(onKeyDown).not.toHaveBeenCalled()
    owner.close()
  })

  it('removes every frame listener once and rejects late registration', () => {
    const first = frameHarness()
    const second = frameHarness()
    const owner = new EpubFrameKeyboardOwner(vi.fn(() => false))
    owner.observe(first.window)
    owner.observe(second.window)

    owner.close()
    owner.close()
    owner.observe(frameHarness().window)

    expect(first.document.removeEventListener).toHaveBeenCalledOnce()
    expect(second.document.removeEventListener).toHaveBeenCalledOnce()
  })

  it('continues cleanup after one frame listener fails and retries only that listener', () => {
    const first = frameHarness()
    const second = frameHarness()
    const failure = new Error('first frame is unloading')
    vi.mocked(first.document.removeEventListener).mockImplementationOnce(() => {
      throw failure
    })
    const owner = new EpubFrameKeyboardOwner(vi.fn(() => false))
    owner.observe(first.window)
    owner.observe(second.window)

    expect(() => owner.close()).toThrow(failure)
    expect(first.document.removeEventListener).toHaveBeenCalledOnce()
    expect(second.document.removeEventListener).toHaveBeenCalledOnce()

    expect(() => owner.close()).not.toThrow()
    expect(first.document.removeEventListener).toHaveBeenCalledTimes(2)
    expect(second.document.removeEventListener).toHaveBeenCalledOnce()
    owner.observe(frameHarness().window)
  })

  it('does not retain a listener when frame registration fails', () => {
    const frame = frameHarness()
    vi.mocked(frame.document.addEventListener).mockImplementationOnce(() => {
      throw new Error('frame is unloading')
    })
    const owner = new EpubFrameKeyboardOwner(vi.fn(() => false))

    expect(() => owner.observe(frame.window)).toThrow('frame is unloading')
    owner.close()

    expect(frame.document.removeEventListener).not.toHaveBeenCalled()
  })
})
