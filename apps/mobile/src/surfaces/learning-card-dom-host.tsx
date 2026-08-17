import type { StoredNote } from '@memorilo/editor-storage'
import type { DOMProps } from 'expo/dom'
import type { EditorSurfaceSession } from './editor-surface-contract'
import type { LearningReviewSeed } from './learning-surface-contract'
import type { MobileRuntime } from '@/application/mobile-runtime'
import { useCallback } from 'react'
import { StyleSheet, View } from 'react-native'
import { encodeBinary } from './editor-surface-contract'
import LearningCardDomSurface from './learning-card-dom-surface'

export interface LearningCardDomHostProps {
  runtime: MobileRuntime
}

function toSurfaceSession(note: StoredNote): EditorSurfaceSession {
  return {
    checkpointSequence: note.checkpointSequence,
    id: note.id,
    latestSequence: note.latestSequence,
    snapshot: note.snapshot === null ? null : encodeBinary(note.snapshot),
    title: note.title,
    updates: note.updates.map(update => encodeBinary(update.update)),
  }
}

const dom: DOMProps = {
  style: { flex: 1 },
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
})

export function LearningCardDomHost({ runtime }: LearningCardDomHostProps) {
  const loadNext = useCallback(async (mode: 'mixed' | 'new' | 'review'): Promise<LearningReviewSeed | null> => {
    const [queue] = await runtime.editor.learning.queue.list({ limit: 1, mode, now: Date.now() })
    if (!queue)
      return null
    const [note, targets] = await Promise.all([
      runtime.editor.notes.getNote({ noteId: queue.noteId }),
      runtime.editor.learning.cards.listTargets(queue.cardId),
    ])
    return { note: toSurfaceSession(note), queue, targets }
  }, [runtime])

  const prepareReview = useCallback((targetId: string) => (
    runtime.editor.learning.reviews.prepare({ reviewedAt: Date.now(), targetId })
  ), [runtime])

  const rateMultiLineCard = useCallback((input: Parameters<typeof runtime.editor.learning.reviews.rateMultiLineCard>[0]) => (
    runtime.editor.learning.reviews.rateMultiLineCard(input)
  ), [runtime])

  const rateTarget = useCallback((input: Parameters<typeof runtime.editor.learning.reviews.rateTarget>[0]) => (
    runtime.editor.learning.reviews.rateTarget(input)
  ), [runtime])

  const undoMany = useCallback((input: Parameters<typeof runtime.editor.learning.reviews.undoMany>[0]) => (
    runtime.editor.learning.reviews.undoMany(input)
  ), [runtime])

  return (
    <View style={styles.root}>
      <LearningCardDomSurface
        dom={dom}
        loadNext={loadNext}
        prepareReview={prepareReview}
        rateMultiLineCard={rateMultiLineCard}
        rateTarget={rateTarget}
        undoMany={undoMany}
      />
    </View>
  )
}
