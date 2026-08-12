import type {
  ReaderAdapterCallbacks,
  ReaderAdapterKeyboardEvent,
} from '../reader-adapter'
import { runSyncLifecycleOperations } from '@memorilo/effect-lifecycle'

function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function')
    return false
  return (target as Element).closest(
    'button, input, select, textarea, [contenteditable="true"]',
  ) !== null
}

function readerKeyboardEvent(event: KeyboardEvent): ReaderAdapterKeyboardEvent {
  return {
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    key: event.key,
    metaKey: event.metaKey,
    repeat: event.repeat,
    shiftKey: event.shiftKey,
  }
}

/** Owns keyboard listeners installed into Readium's dynamically loaded frames. */
export class EpubFrameKeyboardOwner {
  #closing = false
  readonly #listeners = new Map<Document, EventListener>()

  constructor(private readonly onKeyDown: ReaderAdapterCallbacks['onKeyDown']) {}

  close(): void {
    this.#closing = true
    runSyncLifecycleOperations(
      [...this.#listeners].map(([document, listener]) => () => {
        document.removeEventListener('keydown', listener, true)
        this.#listeners.delete(document)
      }),
      'Failed to close EPUB frame keyboard listeners',
    )
  }

  observe(frameWindow: Window): void {
    if (this.#closing)
      return
    const frameDocument = frameWindow.document
    if (this.#listeners.has(frameDocument))
      return
    const listener: EventListener = (event) => {
      const keyboardEvent = event as KeyboardEvent
      if (isInteractiveKeyboardTarget(keyboardEvent.target))
        return
      if (!this.onKeyDown(readerKeyboardEvent(keyboardEvent)))
        return
      keyboardEvent.preventDefault()
      keyboardEvent.stopPropagation()
    }
    frameDocument.addEventListener('keydown', listener, true)
    // Transfer ownership only after the browser accepts the registration.
    // If addEventListener throws, close must not retry removing a listener
    // that was never installed.
    this.#listeners.set(frameDocument, listener)
  }
}
