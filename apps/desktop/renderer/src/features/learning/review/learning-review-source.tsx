import type { DesktopReviewItem } from '@memorilo/desktop-preload'
import type { CardSurfaceItemSelection, CardSurfaceSide } from '@memorilo/editor'
import { CardSurface, createEditorNote, demoEditorAdapters, projectEditorCards } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { desktopEffect, desktopEffectQuery } from '../../../shared/effect-query'
import { learningReviewSourceStyles as styles } from './learning-review-source.stylex'

const ImageOcclusionReview = lazy(async () => {
  const module = await import('./image-occlusion-review')
  return { default: module.ImageOcclusionReview }
})

export function LearningReviewSource({
  item,
  itemSelection,
  revealedItemBlockIds,
  showSource,
  side,
}: {
  item: DesktopReviewItem
  itemSelection?: CardSurfaceItemSelection
  revealedItemBlockIds?: readonly string[]
  showSource: boolean
  side: CardSurfaceSide
}) {
  const { t } = useTranslation('learning')
  if (item.card.kind === 'image-occlusion') {
    if (showSource)
      throw new Error('Image occlusion Cards do not support source context')
    return (
      <Suspense fallback={<div {...stylex.props(styles.sourceStatus)} role="status">{t('loadingSource')}</div>}>
        <ImageOcclusionReview card={item.card} side={side} />
      </Suspense>
    )
  }
  return (
    <EditorLearningReviewSource
      item={item}
      itemSelection={itemSelection}
      revealedItemBlockIds={revealedItemBlockIds}
      showSource={showSource}
      side={side}
    />
  )
}

function EditorLearningReviewSource({
  item,
  itemSelection,
  revealedItemBlockIds,
  showSource,
  side,
}: {
  item: DesktopReviewItem
  itemSelection?: CardSurfaceItemSelection
  revealedItemBlockIds?: readonly string[]
  showSource: boolean
  side: CardSurfaceSide
}) {
  const { t } = useTranslation('learning')
  if (item.card.kind === 'image-occlusion')
    throw new TypeError('Image occlusion Cards require the image occlusion review surface')
  const card = item.card
  const sourceQuery = useQuery(desktopEffectQuery.queryOptions({
    queryFn: () => desktopEffect('notes.get-review-source', () => (
      window.desktop.getNote({ noteId: item.queue.noteId })
    )),
    queryKey: ['learning', 'review-source', item.queue.noteId, item.updatedAt],
  }))
  const source = useMemo(() => {
    if (!sourceQuery.data)
      return null
    const note = createEditorNote({
      id: sourceQuery.data.id,
      snapshot: sourceQuery.data.snapshot,
      title: sourceQuery.data.title,
    })
    const entry = note.getEntries().find((candidate): candidate is Extract<typeof candidate, { kind: 'topic' }> => (
      candidate.kind === 'topic' && candidate.id === item.queue.topicId
    ))
    if (!entry || entry.kind !== 'topic')
      throw new Error(`Note ${note.id} does not contain Review Topic ${item.queue.topicId}`)
    if (entry.topicType === 'image-occlusion')
      throw new Error(`Review Topic ${entry.id} does not contain editor content`)
    if (entry.topicType !== 'whiteboard')
      return { note, topic: note.getTopic(entry.id) }
    const validation = note.getTopicValidationInput(entry.id)
    if (!('embeddedEditors' in validation))
      throw new Error(`WhiteboardTopic ${entry.id} is missing its Embedded Editors`)
    const matchingEditors = Object.values(validation.embeddedEditors)
      .filter(editor => projectEditorCards(editor.document).some(card => card.id === item.card.id))
    if (matchingEditors.length !== 1) {
      throw new Error(
        `Card ${item.card.id} must belong to exactly one Embedded Editor in WhiteboardTopic ${entry.id}`,
      )
    }
    const editor = matchingEditors[0]
    if (!editor)
      throw new Error(`Card ${item.card.id} has no Embedded Editor`)
    return { note, topic: note.getWhiteboardTopic(entry.id).getEmbeddedEditor(editor.editorId) }
  }, [item.card.id, item.queue.topicId, sourceQuery.data])
  if (sourceQuery.isError) {
    return (
      <div {...stylex.props(styles.sourceStatus, styles.sourceError)} role="alert">
        {t('loadSourceFailed', { message: sourceQuery.error instanceof Error ? sourceQuery.error.message : String(sourceQuery.error) })}
      </div>
    )
  }
  if (sourceQuery.isPending || !source)
    return <div {...stylex.props(styles.sourceStatus)} role="status">{t('loadingSource')}</div>

  return (
    <CardSurface
      adapters={demoEditorAdapters}
      card={card}
      itemSelection={itemSelection}
      revealedItemBlockIds={revealedItemBlockIds}
      showSource={showSource}
      side={side}
      topic={source.topic}
    />
  )
}
