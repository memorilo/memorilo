import { describe, expect, it } from 'vitest'
import { createJournalNote } from './editor-note'

function paragraph(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

describe('journal Note canonical aggregate identity', () => {
  it('creates the same initial aggregate independently on every device', () => {
    const first = createJournalNote('2026-08-22')
    const second = createJournalNote('2026-08-22')
    const [firstTopic] = first.getEntries()
    const [secondTopic] = second.getEntries()

    expect(first.id).toBe('journal:2026-08-22')
    expect(first.getIdentity()).toEqual({ kind: 'journal', journalDate: '2026-08-22' })
    expect(second.getIdentity()).toEqual(first.getIdentity())
    expect(firstTopic?.id).toBe('journal:2026-08-22:topic')
    expect(secondTopic?.id).toBe(firstTopic?.id)
    expect(first.getTopicContent(firstTopic!.id).blocks[0]?.id).toBe('journal:2026-08-22:block')
    expect(second.exportSnapshot()).toEqual(first.exportSnapshot())
  })

  it('converges edits made after independent same-date initialization', () => {
    const left = createJournalNote('2026-08-22')
    const right = createJournalNote('2026-08-22')
    const [topic] = left.getEntries()
    if (!topic || topic.kind !== 'topic')
      throw new Error('Journal is missing its canonical Topic')
    const initialBlockId = left.getTopicContent(topic.id).blocks[0]?.id
    if (initialBlockId === undefined)
      throw new Error('Journal is missing its canonical Block')
    const leftVersion = left.getVersion()
    const rightVersion = right.getVersion()

    left.applyTopicBlockEdits({
      edits: [{ blockId: initialBlockId, content: [paragraph('Left')], operation: 'update-block-content' }],
      topicId: topic.id,
    })
    right.applyTopicBlockEdits({
      edits: [{
        blockId: 'right-block',
        content: [paragraph('Right')],
        kind: 'outline',
        operation: 'insert-block',
      }],
      topicId: topic.id,
    })

    left.importUpdates(right.exportUpdates(rightVersion))
    right.importUpdates(left.exportUpdates(leftVersion))

    expect(right.getIdentity()).toEqual(left.getIdentity())
    expect(right.getEntries()).toEqual(left.getEntries())
    expect(right.getTopicContent(topic.id)).toEqual(left.getTopicContent(topic.id))
    expect(left.getTopicContent(topic.id).blocks.map(block => block.text)).toEqual(['Left', 'Right'])
  })

  it('rejects invalid Journal dates', () => {
    expect(() => createJournalNote('2026-02-30')).toThrow('Journal date')
  })
})
