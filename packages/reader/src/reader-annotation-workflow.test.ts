import type { ReaderAnnotation, ReaderSelection } from './types'
import { describe, expect, it } from 'vitest'
import {
  appendReaderHighlight,
  appendReaderNote,
  createReaderAnnotationWorkflowState,
  readerAnnotationWorkflowReducer,
  reviseReaderNote,
} from './reader-annotation-workflow'

const selection: ReaderSelection = {
  anchor: {
    end: 8,
    format: 'txt',
    quote: { exact: 'selected' },
    start: 0,
    type: 'text',
  },
  text: 'selected',
  type: 'text',
}

function note(id = 'note'): Extract<ReaderAnnotation, { kind: 'annotation' }> {
  return {
    anchor: selection.anchor,
    body: 'Original',
    color: 'yellow',
    createdAt: 1,
    id,
    kind: 'annotation',
    updatedAt: 1,
  }
}

describe('reader annotation workflow', () => {
  it('creates normalized highlight and note records without mutating the input', () => {
    const original = [note('existing')]
    const highlighted = appendReaderHighlight(
      original,
      selection,
      'blue',
      { id: 'highlight', timestamp: 2 },
    )
    const annotated = appendReaderNote(
      highlighted,
      selection,
      'green',
      '  New note  ',
      { id: 'annotation', timestamp: 3 },
    )

    expect(original).toHaveLength(1)
    expect(highlighted[1]).toMatchObject({ color: 'blue', id: 'highlight', kind: 'highlight' })
    expect(annotated[2]).toMatchObject({
      body: 'New note',
      color: 'green',
      id: 'annotation',
      kind: 'annotation',
    })
  })

  it('edits only text annotations and rejects empty bodies or highlight edits', () => {
    const annotations = appendReaderHighlight(
      [note()],
      selection,
      'pink',
      { id: 'highlight', timestamp: 2 },
    )

    expect(reviseReaderNote(annotations, 'note', '  Revised  ', 4)).toEqual([
      { ...note(), body: 'Revised', updatedAt: 4 },
      annotations[1],
    ])
    expect(() => reviseReaderNote(annotations, 'note', '  ', 4)).toThrow('must not be empty')
    expect(() => reviseReaderNote(annotations, 'highlight', 'Text', 4)).toThrow(
      'Cannot edit highlight highlight as a text annotation',
    )
  })

  it('keeps activation, composer, and stale annotation state coherent', () => {
    const active = readerAnnotationWorkflowReducer(
      createReaderAnnotationWorkflowState([note()]),
      { annotationId: 'note', type: 'activate' },
    )
    expect(active).toMatchObject({
      activeAnnotationId: 'note',
      annotationPanelOpen: true,
      sidebarTab: 'annotations',
    })

    const editing = readerAnnotationWorkflowReducer(active, {
      annotation: note(),
      type: 'begin-edit',
    })
    const composing = readerAnnotationWorkflowReducer(
      readerAnnotationWorkflowReducer(editing, { open: true, type: 'set-note-composer' }),
      { draft: 'Draft', type: 'set-note-draft' },
    )
    const reset = readerAnnotationWorkflowReducer(composing, { type: 'selection-changed' })
    expect(reset).toMatchObject({ noteComposerOpen: false, noteDraft: '' })

    const reconciled = readerAnnotationWorkflowReducer(reset, { annotations: [], type: 'reconcile' })
    expect(reconciled).toMatchObject({
      activeAnnotationId: null,
      editingAnnotationId: null,
      editingDraft: '',
    })

    const replacedByHighlight = readerAnnotationWorkflowReducer(editing, {
      annotations: appendReaderHighlight([], selection, 'blue', { id: 'note', timestamp: 2 }),
      type: 'reconcile',
    })
    expect(replacedByHighlight).toMatchObject({
      activeAnnotationId: 'note',
      editingAnnotationId: null,
      editingDraft: '',
    })
  })

  it('opens the annotations tab after creating a note and caps incremental rendering', () => {
    const initial = createReaderAnnotationWorkflowState([])
    const created = readerAnnotationWorkflowReducer(initial, { type: 'created-note' })
    const loaded = readerAnnotationWorkflowReducer(created, { annotationCount: 55, type: 'load-more' })

    expect(created).toMatchObject({
      annotationPanelOpen: true,
      sidebarTab: 'annotations',
    })
    expect(loaded.annotationRenderLimit).toBe(55)
  })
})
