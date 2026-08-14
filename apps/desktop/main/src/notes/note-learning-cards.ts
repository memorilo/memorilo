import type {
  EditorStorage,
  LearningCardProjection,
  LearningTopicCardProjection,
} from '@memorilo/editor-storage'
import type { ReviewCardProjection } from '@memorilo/editor/card'
import type { EditorNote } from '@memorilo/editor/note'
import { projectEditorCards, projectImageOcclusionCards } from '@memorilo/editor/card'

type TopicDocument = Extract<ReturnType<EditorNote['getTopicValidationInput']>, { document: unknown }>['document']

function topicDocuments(note: EditorNote, topicId: string): readonly TopicDocument[] {
  const validation = note.getTopicValidationInput(topicId)
  if ('document' in validation)
    return [validation.document]
  if ('embeddedEditors' in validation)
    return Object.values(validation.embeddedEditors).map(editor => editor.document)
  throw new TypeError(`ImageOcclusionTopic ${topicId} does not have ProseMirror documents`)
}

function toLearningCard(card: ReviewCardProjection): LearningCardProjection {
  return {
    cardId: card.id,
    direction: card.kind === 'cloze' ? 'forward' : card.direction,
    itemBlockIds: (card.kind === 'list' || card.kind === 'set') && card.direction === 'forward'
      ? card.items.map(item => item.blockId)
      : [],
    kind: card.kind === 'image-occlusion' ? 'basic' : card.kind,
    sourceBlockId: card.sourceBlockId,
  }
}

export function projectNoteLearningCards(
  note: EditorNote,
  topicIds?: Iterable<string>,
): readonly LearningTopicCardProjection[] {
  const entries = note.getEntries()
  const selectedTopicIds = topicIds === undefined
    ? entries.filter(entry => entry.kind === 'topic').map(entry => entry.id)
    : [...new Set(topicIds)]
  return selectedTopicIds.map((topicId) => {
    const topicOrder = entries.findIndex(candidate => candidate.id === topicId)
    const entry = topicOrder === -1 ? undefined : entries[topicOrder]
    return {
      cards: entry?.kind === 'topic'
        ? entry.topicType === 'spreadsheet'
          ? []
          : entry.topicType === 'image-occlusion'
            ? projectImageOcclusionCards(note.getImageOcclusionTopic(topicId).getState()).map(toLearningCard)
            : topicDocuments(note, topicId).flatMap(document => projectEditorCards(document).map(toLearningCard))
        : [],
      topicId,
      topicOrder: topicOrder === -1 ? 0 : topicOrder,
    }
  })
}

export async function repairNoteLearningCards(
  storage: EditorStorage,
  note: EditorNote,
): Promise<void> {
  const current = projectNoteLearningCards(note)
  const topicIds = new Set([
    ...current.map(topic => topic.topicId),
    ...await storage.learning.cards.listNoteTopicIds(note.id),
  ])
  const projectionByTopic = new Map(
    projectNoteLearningCards(note, topicIds).map(topic => [topic.topicId, topic]),
  )
  for (const topic of projectionByTopic.values()) {
    await storage.learning.cards.reconcileTopicCards({
      ...topic,
      noteId: note.id,
    })
  }
}
