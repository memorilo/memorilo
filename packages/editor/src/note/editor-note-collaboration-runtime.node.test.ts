import { describe, expect, it, vi } from 'vitest'
import { EditorMode } from '../common/editor-mode'
import { createEditorNote } from './editor-note'

describe('editor Note collaboration runtime', () => {
  it('isolates subscriber failures and gives each subscriber an independent update', () => {
    const source = createEditorNote({ id: 'subscriber-note', title: 'Before' })
    const receiver = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
    const receivedUpdates: Uint8Array[] = []
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const stopFailing = source.subscribe((change) => {
      change.update.fill(0)
      throw new Error('subscriber failed')
    })
    const stopReceiver = source.subscribe(change => receivedUpdates.push(change.update))

    expect(() => source.renameNote('After')).not.toThrow()
    receivedUpdates.forEach(update => receiver.importUpdates(update))

    expect(receiver.getTitle()).toBe('After')
    expect(consoleError).toHaveBeenCalledWith(
      'EditorNote subscriber-note subscriber failed',
      expect.objectContaining({ message: 'subscriber failed' }),
    )

    stopFailing()
    stopReceiver()
    consoleError.mockRestore()
  })

  it('reports imported projection roots and preserves version time travel', () => {
    const source = createEditorNote({ id: 'collaboration-note', title: 'Before' })
    const receiver = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
    const receiverVersion = receiver.getVersion()
    const earlierVersion = source.getVersion()

    const topicId = source.createTopic({
      mode: EditorMode.Document,
      title: 'Imported Topic',
    })
    source.renameNote('After')
    const mutation = receiver.importUpdates(source.exportUpdates(receiverVersion))

    expect(mutation).toEqual({
      entriesChanged: true,
      metadataChanged: true,
      topicIds: [topicId],
    })
    expect(receiver.getTitle()).toBe('After')
    expect(receiver.getEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: topicId, title: 'Imported Topic' }),
    ]))

    source.checkout(earlierVersion)
    expect(source.isTimeTraveling()).toBe(true)
    expect(source.getTitle()).toBe('Before')
    source.checkoutLatest()
    expect(source.isTimeTraveling()).toBe(false)
    expect(source.getTitle()).toBe('After')
  })
})
