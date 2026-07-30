import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { EditorNote } from './editor-note'
import { render, waitFor, within } from '@testing-library/react'
import { page } from '@vitest/browser/context'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { userEvent } from '../../test/browser/user-event'
import { EditorMode } from '../common/editor-mode'
import { Editor } from '../editor'
import { createEditorNote } from './editor-note'

const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    search: async () => [],
    create: async tag => tag,
    update: async tag => tag,
  },
}

interface TopicFixture {
  initialText: string
  note: EditorNote
  topicId: string
}

function documentWithText(blockId: string, text: string): NodeJSON {
  return {
    type: 'doc',
    content: [{
      type: 'list',
      attrs: { blockId, checked: false, collapsed: false, kind: 'outline', order: null },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    }],
  }
}

function createNoteWithThreeTopics(noteId: string, texts: readonly [string, string, string]): {
  note: EditorNote
  topics: readonly [TopicFixture, TopicFixture, TopicFixture]
} {
  const note = createEditorNote({ id: noteId })
  const [defaultTopic] = note.getEntries()
  if (defaultTopic?.kind !== 'topic')
    throw new Error(`Note ${noteId} is missing its default Topic`)
  note.deleteEntry({ entryId: defaultTopic.id, strategy: 'delete-subtree' })

  const created = texts.map((initialText, index) => ({
    initialText,
    note,
    topicId: note.createTopic({
      initialContent: documentWithText(`${noteId}-block-${index + 1}`, initialText),
      mode: index % 2 === 0 ? EditorMode.Document : EditorMode.Outline,
      title: `Topic ${index + 1}`,
    }),
  }))
  const [first, second, third] = created
  if (!first || !second || !third)
    throw new Error(`Failed to create three Topics for ${noteId}`)
  return { note, topics: [first, second, third] }
}

function topicText(note: EditorNote, topicId: string): string {
  const topic = note.getTopicContent(topicId)
  const [block] = topic.blocks
  if (!block)
    throw new Error(`Topic ${topicId} has no projected Block`)
  return block.text
}

async function runInteraction(description: string, interaction: () => Promise<void>): Promise<void> {
  try {
    await interaction()
  }
  catch (error) {
    throw new Error(description, { cause: error })
  }
}

function topicKey(topic: TopicFixture): string {
  return `${topic.note.id}:${topic.topicId}`
}

function TopicSwitcher({ topics }: { topics: readonly TopicFixture[] }) {
  const [firstTopic] = topics
  if (!firstTopic)
    throw new Error('Topic switcher requires at least one Topic')
  const [activeKey, setActiveKey] = useState(() => topicKey(firstTopic))
  const activeTopic = topics.find(topic => topicKey(topic) === activeKey)
  if (!activeTopic)
    throw new Error(`Active Topic ${activeKey} is missing from the switcher`)

  return (
    <>
      <div>
        {topics.map((topic, index) => (
          <button
            key={topicKey(topic)}
            aria-label={`Open Topic ${index + 1}`}
            type="button"
            onClick={() => setActiveKey(topicKey(topic))}
          >
            {index + 1}
          </button>
        ))}
      </div>
      <Editor adapters={adapters} topic={activeTopic.note.getTopic(activeTopic.topicId)} />
    </>
  )
}

function restoredNoteFor(topic: TopicFixture, left: EditorNote, right: EditorNote): EditorNote {
  if (topic.note.id === left.id)
    return left
  if (topic.note.id === right.id)
    return right
  throw new Error(`Unexpected source Note ${topic.note.id}`)
}

describe('topic switching', () => {
  it('switches one Editor across six Topics in two Notes and restores every edit', async () => {
    const left = createNoteWithThreeTopics('switching-note-left', [
      'Left planning sample',
      'Left research sample',
      'Left review sample',
    ])
    const right = createNoteWithThreeTopics('switching-note-right', [
      'Right planning sample',
      'Right research sample',
      'Right review sample',
    ])
    expect(left.note.getEntries().map(entry => entry.kind)).toEqual(['topic', 'topic', 'topic'])
    expect(right.note.getEntries().map(entry => entry.kind)).toEqual(['topic', 'topic', 'topic'])

    const rotation = [
      left.topics[0],
      right.topics[0],
      left.topics[1],
      right.topics[1],
      left.topics[2],
      right.topics[2],
    ]
    const topics: readonly TopicFixture[] = rotation
    const rendered = render(<TopicSwitcher topics={topics} />)
    const editedTexts = new Map<string, string>()

    for (const [index, topic] of topics.entries()) {
      await runInteraction(
        `Failed to switch to Topic ${index + 1}`,
        () => userEvent.click(page.getByRole('button', { name: `Open Topic ${index + 1}` })),
      )
      await within(rendered.container).findByText(topic.initialText, { exact: true })
      await runInteraction(
        `Failed to focus Topic ${index + 1}`,
        () => userEvent.click(page.getByText(topic.initialText, { exact: true })),
      )
      await runInteraction(`Failed to edit Topic ${index + 1}`, () => userEvent.keyboard(`{End} edited-${index + 1}`))
      const editedText = `${topic.initialText} edited-${index + 1}`
      editedTexts.set(topic.topicId, editedText)
      await waitFor(() => {
        expect(within(rendered.container).getByText(editedText, { exact: true })).toBeVisible()
        expect(topicText(topic.note, topic.topicId)).toBe(editedText)
      })
    }

    for (const [index, topic] of topics.entries()) {
      const editedText = editedTexts.get(topic.topicId)
      if (editedText === undefined)
        throw new Error(`Topic ${topic.topicId} is missing its expected edit`)
      await runInteraction(
        `Failed to switch back to Topic ${index + 1}`,
        () => userEvent.click(page.getByRole('button', { name: `Open Topic ${index + 1}` })),
      )
      await waitFor(() => {
        expect(within(rendered.container).getByText(editedText, { exact: true })).toBeVisible()
      })
    }

    const restoredLeft = createEditorNote({
      id: left.note.id,
      snapshot: left.note.exportSnapshot(),
    })
    const restoredRight = createEditorNote({
      id: right.note.id,
      snapshot: right.note.exportSnapshot(),
    })
    expect(restoredLeft.getEntries().map(entry => entry.kind)).toEqual(['topic', 'topic', 'topic'])
    expect(restoredRight.getEntries().map(entry => entry.kind)).toEqual(['topic', 'topic', 'topic'])
    const restoredTopics = topics.map(topic => ({
      ...topic,
      note: restoredNoteFor(topic, restoredLeft, restoredRight),
    }))
    rendered.rerender(<TopicSwitcher topics={restoredTopics} />)

    for (const [index, topic] of restoredTopics.entries()) {
      const editedText = editedTexts.get(topic.topicId)
      if (editedText === undefined)
        throw new Error(`Topic ${topic.topicId} is missing its expected restored content`)
      await runInteraction(
        `Failed to switch to restored Topic ${index + 1}`,
        () => userEvent.click(page.getByRole('button', { name: `Open Topic ${index + 1}` })),
      )
      await waitFor(() => {
        expect(within(rendered.container).getByText(editedText, { exact: true })).toBeVisible()
      })
      expect(topicText(topic.note, topic.topicId)).toBe(editedText)
    }
  })
})
