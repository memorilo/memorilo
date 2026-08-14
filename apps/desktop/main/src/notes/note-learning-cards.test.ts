import { createEditorNote } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'
import { projectNoteLearningCards } from './note-learning-cards'

describe('note learning Card projection', () => {
  it('projects a SpreadsheetTopic as a Topic without learning Cards', () => {
    const note = createEditorNote({ id: 'spreadsheet-learning', title: 'Plan' })
    const topicId = note.createSpreadsheetTopic({ columnCount: 2, rowCount: 2, title: 'Budget' })
    const topicOrder = note.getEntries().findIndex(entry => entry.id === topicId)

    expect(projectNoteLearningCards(note, [topicId])).toEqual([{
      cards: [],
      topicId,
      topicOrder,
    }])
  })
})
