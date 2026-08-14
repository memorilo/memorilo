import type { EditorSpreadsheetTopicDocument } from '@memorilo/editor'
import { createEditorNote } from '@memorilo/editor'
import { readSpreadsheetCell } from '@memorilo/spreadsheet'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { SpreadsheetEditor } from './spreadsheet-editor'

function createFixture(): EditorSpreadsheetTopicDocument {
  const note = createEditorNote({ id: 'spreadsheet-toolbar-test' })
  const topicId = note.createSpreadsheetTopic({
    columnCount: 2,
    rowCount: 2,
    title: 'Budget',
  })
  const topic = note.getSpreadsheetTopic(topicId)
  const sheet = topic.getWorkbook().sheets[0]
  if (!sheet)
    throw new Error('Spreadsheet toolbar test requires a first Sheet')
  topic.apply([{
    columnId: sheet.columns[0]!.id,
    input: '123',
    rowId: sheet.rows[0]!.id,
    sheetId: sheet.id,
    type: 'set-cell-input',
  }])
  return topic
}

function firstCell(topic: EditorSpreadsheetTopicDocument) {
  const sheet = topic.getWorkbook().sheets[0]
  if (!sheet)
    throw new Error('Spreadsheet toolbar test requires a first Sheet')
  return Effect.runSync(readSpreadsheetCell(sheet, 'A1'))
}

function renderEditor(topic: EditorSpreadsheetTopicDocument) {
  return render(
    <div style={{ height: 500, width: 800 }}>
      <SpreadsheetEditor title="Budget" topic={topic} />
    </div>,
  )
}

describe('spreadsheet editor controls', () => {
  it('applies bold, italic, and underline to the selected Cell', async () => {
    const topic = createFixture()
    const rendered = renderEditor(topic)

    for (const [buttonName, formatKey, styleProperty, expectedStyle] of [
      ['Bold', 'bold', 'fontWeight', '700'],
      ['Italic', 'italic', 'fontStyle', 'italic'],
      ['Underline', 'underline', 'textDecorationLine', 'underline'],
    ] as const) {
      const button = rendered.getByRole('button', { name: buttonName })
      fireEvent.click(button)

      await waitFor(() => {
        expect(button).toHaveAttribute('aria-pressed', 'true')
        expect(firstCell(topic).format[formatKey]).toBe(true)
        const cell = rendered.getAllByRole('gridcell')[0]!
        expect(getComputedStyle(cell)[styleProperty]).toContain(expectedStyle)
      })
    }
  })

  it('applies left, center, and right alignment to the selected Cell', async () => {
    const topic = createFixture()
    const rendered = renderEditor(topic)

    for (const [buttonName, alignment, justifyContent] of [
      ['Align center', 'center', 'center'],
      ['Align right', 'right', 'flex-end'],
      ['Align left', 'left', 'flex-start'],
    ] as const) {
      const button = rendered.getByRole('button', { name: buttonName })
      fireEvent.click(button)

      await waitFor(() => {
        expect(button).toHaveAttribute('aria-pressed', 'true')
        expect(firstCell(topic).format.alignment).toBe(alignment)
        const cell = rendered.getAllByRole('gridcell')[0]!
        expect(getComputedStyle(cell).justifyContent).toBe(justifyContent)
      })
    }
  })

  it('switches the selected Cell between currency and percent formats', async () => {
    const topic = createFixture()
    const rendered = renderEditor(topic)
    const currency = rendered.getByRole('button', { name: 'Currency' })
    const percent = rendered.getByRole('button', { name: 'Percent' })

    fireEvent.click(currency)
    await waitFor(() => {
      expect(currency).toHaveAttribute('aria-pressed', 'true')
      expect(percent).toHaveAttribute('aria-pressed', 'false')
      expect(firstCell(topic).format.kind).toBe('currency')
      expect(getComputedStyle(rendered.getAllByRole('gridcell')[0]!).justifyContent).toBe('flex-end')
    })

    fireEvent.click(percent)
    await waitFor(() => {
      expect(currency).toHaveAttribute('aria-pressed', 'false')
      expect(percent).toHaveAttribute('aria-pressed', 'true')
      expect(firstCell(topic).format.kind).toBe('percent')
      expect(getComputedStyle(rendered.getAllByRole('gridcell')[0]!).justifyContent).toBe('flex-end')
    })
  })

  it('adds a Sheet, activates it, and switches back to the original Sheet', async () => {
    const topic = createFixture()
    const rendered = renderEditor(topic)

    fireEvent.click(rendered.getByRole('button', { name: 'Add sheet' }))

    const secondSheet = await rendered.findByRole('tab', { name: 'Sheet 2' })
    expect(secondSheet).toHaveAttribute('aria-selected', 'true')
    expect(topic.getWorkbook().sheets).toHaveLength(2)
    expect(rendered.getAllByRole('gridcell')[0]).toHaveTextContent('')

    fireEvent.click(rendered.getByRole('tab', { name: 'Sheet 1' }))

    await waitFor(() => {
      expect(rendered.getByRole('tab', { name: 'Sheet 1' })).toHaveAttribute('aria-selected', 'true')
      expect(rendered.getAllByRole('gridcell')[0]).toHaveTextContent('123')
    })
  })
})
