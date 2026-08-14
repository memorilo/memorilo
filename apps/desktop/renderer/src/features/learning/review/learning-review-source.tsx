import type { DesktopReviewItem } from '@memorilo/desktop-preload'
import type { CardSurfaceItemSelection, CardSurfaceSide } from '@memorilo/editor'
import { CardSurface, createEditorNote, demoEditorAdapters } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

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
  const sourceQuery = useQuery({
    queryFn: () => window.desktop.getNote({ noteId: item.queue.noteId }),
    queryKey: ['learning', 'review-source', item.queue.noteId, item.updatedAt],
  })
  const source = useMemo(() => {
    if (!sourceQuery.data)
      return null
    const note = createEditorNote({
      id: sourceQuery.data.id,
      snapshot: sourceQuery.data.snapshot,
      title: sourceQuery.data.title,
    })
    const entry = note.getEntries().find(candidate => (
      candidate.kind === 'topic' && candidate.id === item.queue.topicId
    ))
    if (!entry || entry.kind !== 'topic')
      throw new Error(`Note ${note.id} does not contain Review Topic ${item.queue.topicId}`)
    if (entry.topicType === 'image-occlusion')
      throw new Error(`Review Topic ${entry.id} does not contain editor content`)
    return { note, topic: note.getTopic(entry.id) }
  }, [item.queue.topicId, sourceQuery.data])
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
