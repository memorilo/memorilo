import type { EditorAdapters } from '../adapters/editor-adapters'
import type { EditorNote, EditorTopicDocument } from '../note/editor-note'
import type { ReviewCardProjection } from './card-model'
import type { CardSurfaceItemSelection, CardSurfaceSide } from './card-surface'
import { useMemo } from 'react'
import { projectEditorCards } from './card-model'
import { CardSurface } from './card-surface'
import { ImageOcclusionReview } from './image-occlusion-review'

export interface ReviewCardSourceProps {
  adapters: EditorAdapters
  card: ReviewCardProjection
  itemSelection?: CardSurfaceItemSelection
  note: EditorNote | null
  revealedItemBlockIds?: readonly string[]
  showSource: boolean
  side: CardSurfaceSide
  topicId: string
}

function resolveEditorTopic(
  note: EditorNote,
  topicId: string,
  cardId: string,
): EditorTopicDocument {
  const entry = note.getEntries().find(candidate => candidate.kind === 'topic' && candidate.id === topicId)
  if (!entry || entry.kind !== 'topic')
    throw new Error(`Note ${note.id} does not contain Review Topic ${topicId}`)
  if (entry.topicType === 'image-occlusion')
    throw new Error(`Review Topic ${entry.id} does not contain editor content`)
  if (entry.topicType !== 'whiteboard')
    return note.getTopic(entry.id)

  const validation = note.getTopicValidationInput(entry.id)
  if (!('embeddedEditors' in validation))
    throw new Error(`WhiteboardTopic ${entry.id} is missing its Embedded Editors`)
  const matchingEditors = Object.values(validation.embeddedEditors)
    .filter(editor => projectEditorCards(editor.document).some(card => card.id === cardId))
  if (matchingEditors.length !== 1) {
    throw new Error(
      `Card ${cardId} must belong to exactly one Embedded Editor in WhiteboardTopic ${entry.id}`,
    )
  }
  const editor = matchingEditors[0]
  if (!editor)
    throw new Error(`Card ${cardId} has no Embedded Editor`)
  return note.getWhiteboardTopic(entry.id).getEmbeddedEditor(editor.editorId)
}

export function ReviewCardSource({
  adapters,
  card,
  itemSelection,
  note,
  revealedItemBlockIds,
  showSource,
  side,
  topicId,
}: ReviewCardSourceProps) {
  const topic = useMemo(() => {
    if (card.kind === 'image-occlusion')
      return null
    if (!note)
      throw new Error(`Review Card ${card.id} requires its Note source`)
    return resolveEditorTopic(note, topicId, card.id)
  }, [card, note, topicId])

  if (card.kind === 'image-occlusion') {
    if (showSource)
      throw new Error('Image occlusion Cards do not support source context')
    return <ImageOcclusionReview card={card} side={side} />
  }
  if (!topic)
    throw new Error(`Review Card ${card.id} is missing its editor source`)
  return (
    <CardSurface
      adapters={adapters}
      card={card}
      itemSelection={itemSelection}
      revealedItemBlockIds={revealedItemBlockIds}
      showSource={showSource}
      side={side}
      topic={topic}
    />
  )
}
