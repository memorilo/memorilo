import type { DesktopReviewItem } from '@memorilo/desktop-preload'
import { createEditorNote, demoEditorAdapters, Editor, EditorMode } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { learningReviewStyles as styles } from './-learning-review.stylex'

export function LearningReviewSource({ item }: { item: DesktopReviewItem }) {
  const { t } = useTranslation('learning')
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
    if (!entry)
      throw new Error(`Note ${note.id} does not contain Review Topic ${item.queue.topicId}`)
    return { note, topic: note.getTopic(entry.id) }
  }, [item.queue.topicId, sourceQuery.data])
  const outline = useMemo(() => ({
    focus: { blockId: item.card.sourceBlockId },
  }), [item.card.sourceBlockId])

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
    <div {...stylex.props(styles.sourceEditor)}>
      <Editor
        adapters={demoEditorAdapters}
        mode={EditorMode.Outline}
        outline={outline}
        readOnly
        topic={source.topic}
      />
    </div>
  )
}
