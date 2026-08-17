import type { DesktopReviewItem } from '@memorilo/desktop-api'
import type { CardSurfaceItemSelection, CardSurfaceSide } from '@memorilo/editor'
import { createEditorNote, demoEditorAdapters, ReviewCardSource } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopRequests } from '../../../shared/desktop-requests'

import { desktopEffect, desktopEffectQuery } from '../../../shared/effect-query'
import { learningReviewSourceStyles as styles } from './learning-review-source.stylex'

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
  if (item.card.kind === 'image-occlusion') {
    return (
      <ReviewCardSource
        adapters={demoEditorAdapters}
        card={item.card}
        itemSelection={itemSelection}
        note={null}
        revealedItemBlockIds={revealedItemBlockIds}
        showSource={showSource}
        side={side}
        topicId={item.queue.topicId}
      />
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
  const sourceQuery = useQuery(desktopEffectQuery.queryOptions({
    queryFn: () => desktopEffect('notes.get-review-source', () => (
      desktopRequests.getNote({ noteId: item.queue.noteId })
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
    return note
  }, [sourceQuery.data])
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
    <ReviewCardSource
      adapters={demoEditorAdapters}
      card={item.card}
      itemSelection={itemSelection}
      note={source}
      revealedItemBlockIds={revealedItemBlockIds}
      showSource={showSource}
      side={side}
      topicId={item.queue.topicId}
    />
  )
}
