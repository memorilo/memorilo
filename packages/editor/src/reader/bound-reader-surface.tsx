import type {
  ReaderAnnotation,
  ReaderAnnotationDependents,
  ReaderAnnotationTopicCreateInput,
  ReaderImageOcclusionOverlay,
  ReaderPosition,
  ReaderProps,
  ReaderSource,
} from '@memorilo/reader'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { EditorProps } from '../editor'
import type { EditorNote } from '../note/editor-note'
import { Reader, WindowReader } from '@memorilo/reader'
import { PanelRight } from 'lucide-react'
import { useState } from 'react'
import { Editor } from '../editor'
import { NoteStructureInspector } from '../ui/note-structure-inspector/note-structure-inspector'

export interface BoundReaderSurfaceProps {
  adapters: EditorAdapters
  annotationCopyBookTitle?: string
  annotationCopyFormat?: ReaderProps['annotationCopyFormat']
  annotationEditingEnabled?: boolean
  annotations?: readonly ReaderAnnotation[]
  arrowKeyPageTurning?: boolean
  auxiliarySidebarLabel?: string
  chrome?: 'embedded' | 'window'
  collapsedEntryIds?: ReadonlySet<string>
  currentTopicId: string
  entries?: ReturnType<EditorNote['getEntries']>
  imageOcclusionEnabled?: boolean
  initialAnnotationId?: string
  initialPosition?: ReaderPosition | null
  initialPresentationMode?: ReaderProps['initialPresentationMode']
  learningEnabled?: boolean
  note: EditorNote
  onAnnotationsChange?: ReaderProps['onAnnotationsChange']
  onCreateAnnotationTopic?: (input: ReaderAnnotationTopicCreateInput, signal: AbortSignal) => Promise<string>
  onGetAnnotationDependents?: (annotation: ReaderAnnotation) => ReaderAnnotationDependents
  onOpenReaderRegionImageOcclusion?: ReaderProps['onOpenReaderRegionImageOcclusion']
  onOpenTopic?: (topicId: string) => void
  onPositionChange?: ReaderProps['onPositionChange']
  onPrepareAnnotationDeletion?: ReaderProps['onPrepareAnnotationDeletion']
  onToggleEntry?: (entryId: string) => void
  outline?: EditorProps['outline']
  pageMode?: ReaderProps['pageMode']
  sidebarActions?: ReaderProps['sidebarActions']
  source: ReaderSource
  title?: string
}

export function BoundReaderSurface({
  adapters,
  annotationCopyBookTitle,
  annotationCopyFormat,
  annotationEditingEnabled = true,
  annotations,
  arrowKeyPageTurning,
  auxiliarySidebarLabel = 'Note',
  chrome = 'embedded',
  collapsedEntryIds,
  currentTopicId,
  entries,
  imageOcclusionEnabled = true,
  initialAnnotationId,
  initialPosition,
  initialPresentationMode,
  learningEnabled = true,
  note,
  onAnnotationsChange,
  onCreateAnnotationTopic,
  onGetAnnotationDependents,
  onOpenReaderRegionImageOcclusion,
  onOpenTopic,
  onPositionChange,
  onPrepareAnnotationDeletion,
  onToggleEntry,
  outline,
  pageMode,
  sidebarActions,
  source,
  title,
}: BoundReaderSurfaceProps) {
  const [internalCollapsedEntryIds, setInternalCollapsedEntryIds] = useState<ReadonlySet<string>>(() => new Set())
  const resolvedCollapsedEntryIds = collapsedEntryIds ?? internalCollapsedEntryIds
  const resolvedEntries = entries ?? note.getEntries()
  const imageOcclusionOverlays: readonly ReaderImageOcclusionOverlay[] = !imageOcclusionEnabled || !learningEnabled || !annotations
    ? []
    : annotations.flatMap((annotation) => {
        if (annotation.anchors[0]?.type !== 'region')
          return []
        const topic = note.findImageOcclusionTopic({
          annotationId: annotation.id,
          kind: 'reader-region',
          topicId: currentTopicId,
        })
        if (!topic)
          return []
        const state = topic.getState()
        return [{
          annotationId: annotation.id,
          image: state.image,
          shapes: state.shapes,
        }]
      })

  const toggleEntry = onToggleEntry ?? ((entryId: string) => {
    setInternalCollapsedEntryIds((current) => {
      const next = new Set(current)
      if (next.has(entryId))
        next.delete(entryId)
      else
        next.add(entryId)
      return next
    })
  })
  const ReaderComponent = chrome === 'window' ? WindowReader : Reader

  return (
    <ReaderComponent
      annotationCopyBookTitle={annotationCopyBookTitle}
      annotationCopyFormat={annotationCopyFormat}
      annotationEditingEnabled={annotationEditingEnabled}
      annotations={annotations}
      arrowKeyPageTurning={arrowKeyPageTurning}
      auxiliarySidebar={{
        content: (
          <NoteStructureInspector
            collapsedEntryIds={resolvedCollapsedEntryIds}
            currentTopicId={currentTopicId}
            entries={resolvedEntries}
            learningEnabled={learningEnabled}
            note={note}
            onOpenTopic={topicId => onOpenTopic?.(topicId)}
            onToggleEntry={toggleEntry}
            showTitle={false}
          />
        ),
        icon: <PanelRight aria-hidden="true" size={14} strokeWidth={1.8} />,
        label: auxiliarySidebarLabel,
      }}
      imageOcclusionOverlays={imageOcclusionOverlays.length > 0 ? imageOcclusionOverlays : undefined}
      initialAnnotationId={initialAnnotationId}
      initialPosition={initialPosition}
      initialPresentationMode={initialPresentationMode}
      onAnnotationsChange={onAnnotationsChange}
      onCreateAnnotationTopic={onCreateAnnotationTopic}
      onGetAnnotationDependents={onGetAnnotationDependents}
      onOpenReaderRegionImageOcclusion={imageOcclusionEnabled && learningEnabled ? onOpenReaderRegionImageOcclusion : undefined}
      onPositionChange={onPositionChange}
      onPrepareAnnotationDeletion={onPrepareAnnotationDeletion}
      pageMode={pageMode}
      renderAnnotationEditor={({ annotation, readOnly }) => {
        if (!annotation.annotationTopicId)
          throw new Error(`Reader annotation ${annotation.id} has no Topic Editor binding`)
        return (
          <Editor
            adapters={adapters}
            layout="embedded"
            learningEnabled={learningEnabled}
            outline={outline}
            readOnly={readOnly}
            topic={note.getTopic(annotation.annotationTopicId)}
          />
        )
      }}
      sidebarActions={sidebarActions}
      source={source}
      title={title}
    />
  )
}
