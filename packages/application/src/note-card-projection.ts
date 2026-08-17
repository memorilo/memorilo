import type { ReviewCardProjection } from '@memorilo/editor/card'
import type { EditorNote } from '@memorilo/editor/note'
import { projectEditorCards, projectImageOcclusionCards } from '@memorilo/editor/card'
import { projectCardTopicCards } from '@memorilo/editor/note'

type TopicDocument = Extract<ReturnType<EditorNote['getTopicValidationInput']>, { document: unknown }>['document']

export interface EditorNoteCardProjection {
  card: ReviewCardProjection
  noteTitle: string
  topicTitle: string
  updatedAt: number
}

function topicDocuments(note: EditorNote, topicId: string): readonly TopicDocument[] {
  const validation = note.getTopicValidationInput(topicId)
  if ('document' in validation)
    return [validation.document]
  if ('embeddedEditors' in validation)
    return Object.values(validation.embeddedEditors).map(editor => editor.document)
  throw new TypeError(`ImageOcclusionTopic ${topicId} does not have ProseMirror documents`)
}

export function projectEditorNoteCard(
  note: EditorNote,
  input: { cardId: string, topicId: string },
  updatedAt: number,
): EditorNoteCardProjection | null {
  const entry = note.getEntries().find(candidate => candidate.id === input.topicId)
  if (!entry || entry.kind !== 'topic')
    return null
  const cardSource = entry.topicType === 'regular' ? entry.cardSource : undefined
  const cards = entry.topicType === 'spreadsheet'
    ? []
    : entry.topicType === 'image-occlusion'
      ? projectImageOcclusionCards(note.getImageOcclusionTopic(entry.id).getState())
      : entry.topicType === 'regular'
        ? cardSource === undefined
          ? []
          : topicDocuments(note, input.topicId).flatMap(document => projectCardTopicCards(document, cardSource))
        : topicDocuments(note, input.topicId).flatMap(document => projectEditorCards(document))
  const card = cards.find(candidate => candidate.id === input.cardId)
  if (!card)
    return null
  return {
    card,
    noteTitle: note.getTitle(),
    topicTitle: entry.title,
    updatedAt,
  }
}
