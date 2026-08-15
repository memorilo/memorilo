import type { ReaderAnnotation, ReaderSelection } from './types'
import { describe, expect, it } from 'vitest'
import {
  appendReaderHighlight,
  attachReaderAnnotationTopic,
  createReaderAnnotationWorkflowState,
  detachReaderAnnotationTopic,
  readerAnnotationWorkflowReducer,
  reviseReaderAnnotation,
} from './reader-annotation-workflow'

const selection: Extract<ReaderSelection, { type: 'text' }> = {
  anchors: [{
    end: 8,
    format: 'txt',
    quote: { exact: 'selected' },
    start: 0,
    type: 'text',
  }],
  text: 'selected',
  type: 'text',
}

function annotation(id = 'annotation', annotationTopicId?: string): ReaderAnnotation {
  return {
    anchors: selection.anchors,
    ...(annotationTopicId === undefined ? {} : { annotationTopicId }),
    color: 'yellow',
    createdAt: 1,
    id,
    style: 'highlight',
    updatedAt: 1,
  }
}

describe('reader annotation workflow', () => {
  it('creates highlight records and attaches one annotation Topic without mutating input', () => {
    const original = [annotation('existing')]
    const highlighted = appendReaderHighlight(
      original,
      selection,
      'blue',
      { id: 'highlight', timestamp: 2 },
    )
    const annotated = attachReaderAnnotationTopic(
      highlighted,
      'highlight',
      'annotation-topic',
      3,
    )

    expect(original).toHaveLength(1)
    expect(highlighted[1]).toEqual({
      anchors: selection.anchors,
      color: 'blue',
      createdAt: 2,
      id: 'highlight',
      style: 'highlight',
      updatedAt: 2,
    })
    expect(annotated[1]).toEqual({ ...highlighted[1], annotationTopicId: 'annotation-topic', updatedAt: 3 })
    expect(() => attachReaderAnnotationTopic(annotated, 'highlight', 'second-topic', 4)).toThrow(
      'already has annotation Topic annotation-topic',
    )
    expect(detachReaderAnnotationTopic(annotated, 'highlight', 5)[1]).toEqual({
      ...highlighted[1],
      updatedAt: 5,
    })
  })

  it('changes color and text style while rejecting underline for region annotations', () => {
    const annotations = [annotation()]

    expect(reviseReaderAnnotation(annotations, 'annotation', { color: 'pink', style: 'underline' }, 4)).toEqual([
      { ...annotation(), color: 'pink', style: 'underline', updatedAt: 4 },
    ])

    const region: ReaderAnnotation = {
      anchors: [{ end: 8, format: 'txt' as const, start: 0, type: 'region' as const }],
      color: 'yellow',
      createdAt: 1,
      id: 'region',
      style: 'highlight',
      updatedAt: 1,
    }
    expect(() => reviseReaderAnnotation([region], 'region', { style: 'underline' }, 4)).toThrow(
      'Region annotation region cannot use underline style',
    )
  })

  it('keeps activation and stale annotation state coherent', () => {
    const active = readerAnnotationWorkflowReducer(
      createReaderAnnotationWorkflowState([annotation()]),
      { annotationId: 'annotation', openPanel: false, type: 'activate' },
    )
    expect(active).toMatchObject({
      activeAnnotationId: 'annotation',
      annotationPanelOpen: false,
      sidebarTab: 'contents',
    })

    const linked = readerAnnotationWorkflowReducer(
      active,
      { annotationId: 'annotation', openPanel: true, type: 'activate' },
    )
    expect(linked).toMatchObject({ annotationPanelOpen: true, sidebarTab: 'annotations' })

    const palette = readerAnnotationWorkflowReducer(linked, { open: true, type: 'set-color-palette' })
    const reset = readerAnnotationWorkflowReducer(palette, { type: 'selection-changed' })
    expect(reset).toMatchObject({ colorPaletteOpen: false })

    const reconciled = readerAnnotationWorkflowReducer(reset, { annotations: [], type: 'reconcile' })
    expect(reconciled.activeAnnotationId).toBeNull()
  })

  it('opens the annotations tab after attaching a Topic and caps incremental rendering', () => {
    const initial = createReaderAnnotationWorkflowState([])
    const created = readerAnnotationWorkflowReducer(initial, { annotationId: 'annotation', type: 'attached-topic' })
    const loaded = readerAnnotationWorkflowReducer(created, { annotationCount: 55, type: 'load-more' })

    expect(created).toMatchObject({
      activeAnnotationId: 'annotation',
      annotationPanelOpen: true,
      sidebarTab: 'annotations',
    })
    expect(loaded.annotationRenderLimit).toBe(55)
  })
})
