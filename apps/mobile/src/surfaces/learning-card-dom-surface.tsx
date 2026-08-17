'use dom'

import type {
  ActiveLearningReview,
  LearningReviewItem,
  LearningReviewProjection,
  PreparedLearningReview,
} from '@memorilo/application/learning-review'
import type { EditorNote } from '@memorilo/editor'
import type { ReviewRating } from '@memorilo/editor-storage'
import type { DOMProps } from 'expo/dom'
import type { LearningReviewSeed, LearningSurfaceFunctions } from './learning-surface-contract'
import {
  createLearningReviewRatingModel,
  resolveLearningReviewItem,
} from '@memorilo/application/learning-review'
import { projectEditorNoteCard } from '@memorilo/application/note-card-projection'
import {
  createEditorNote,
  demoEditorAdapters,
  ReviewCardSource,
} from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import i18next from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { decodeBinary } from './editor-surface-contract'
import { initEditorSurfaceI18n } from './editor-surface-i18n'
import { learningCardDomStyles as styles } from './learning-card-dom-surface.stylex'
import { loadMobileDomFonts } from './mobile-dom-fonts'

export interface LearningCardDomSurfaceProps extends LearningSurfaceFunctions {
  dom?: DOMProps
}

interface ActiveView {
  active: ActiveLearningReview
  note: EditorNote
}

interface ResolvedSeed {
  item: LearningReviewItem
  note: EditorNote
}

interface ReviewHistoryEntry {
  active: ActiveLearningReview
  note: EditorNote
  undoCommands: readonly import('@memorilo/editor-storage').UndoLearningReviewCommand[]
}

type View
  = | { error: Error, status: 'error' }
    | { status: 'complete' }
    | { status: 'loading' }
    | ({ status: 'active' } & ActiveView)

const ratings: readonly ReviewRating[] = ['again', 'hard', 'good', 'easy']

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function openNote(seed: LearningReviewSeed): EditorNote {
  return createEditorNote({
    id: seed.note.id,
    snapshot: seed.note.snapshot === null ? null : decodeBinary(seed.note.snapshot),
    title: seed.note.title,
    updates: seed.note.updates.map(decodeBinary),
  })
}

function resolveSeed(seed: LearningReviewSeed): ResolvedSeed {
  const note = openNote(seed)
  const projection = projectEditorNoteCard(note, {
    cardId: seed.queue.cardId,
    topicId: seed.queue.topicId,
  }, seed.note.latestSequence)
  if (!projection)
    throw new Error(`Review Card ${seed.queue.cardId} is missing from its Note projection`)
  return {
    item: resolveLearningReviewItem(projection, seed.queue, seed.targets),
    note,
  }
}

function intervalLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  if (seconds < 60)
    return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60)
    return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24)
    return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30)
    return `${days}d`
  const months = Math.round(days / 30)
  if (months < 12)
    return `${months}mo`
  return `${Math.round(months / 12)}y`
}

function CardMaterial({ active, note, onToggleForgotten, projection }: ActiveView & {
  onToggleForgotten: (itemBlockId: string) => void
  projection: LearningReviewProjection
}) {
  return (
    <ReviewCardSource
      adapters={demoEditorAdapters}
      card={active.item.card}
      itemSelection={projection.supportsForgottenSelection
        ? {
            label: (_itemBlockId, selected) => selected ? 'Mark remembered' : 'Mark forgotten',
            onToggle: onToggleForgotten,
            selectedItemBlockIds: [...active.forgottenItemBlockIds],
          }
        : undefined}
      note={note}
      revealedItemBlockIds={projection.visibleItemBlockIds}
      showSource={active.sourceVisible}
      side={active.revealed ? 'answer' : 'question'}
      topicId={active.item.queue.topicId}
    />
  )
}

export default function LearningCardDomSurface(props: LearningCardDomSurfaceProps) {
  const callbacks = useRef<LearningSurfaceFunctions>(props)
  callbacks.current = props
  const model = useMemo(() => createLearningReviewRatingModel({
    rateMultiLineCard: input => callbacks.current.rateMultiLineCard(input),
    rateTarget: input => callbacks.current.rateTarget(input),
    undoMany: input => callbacks.current.undoMany(input),
  }), [])
  const [i18nReady, setI18nReady] = useState(false)
  const [startupError, setStartupError] = useState<Error | null>(null)
  const [mode, setMode] = useState<'mixed' | 'new' | 'review'>('mixed')
  const [view, setView] = useState<View>({ status: 'loading' })
  const [prepared, setPrepared] = useState<ReadonlyMap<string, PreparedLearningReview> | null>(null)
  const [history, setHistory] = useState<readonly ReviewHistoryEntry[]>([])
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<Error | null>(null)
  const preparationRevision = useRef(0)
  const preparationRequest = useRef(0)
  const loadRequest = useRef(0)

  useEffect(() => {
    let active = true
    void Promise.all([
      initEditorSurfaceI18n(i18next),
      loadMobileDomFonts(),
    ]).then(
      () => {
        if (active)
          setI18nReady(true)
      },
      (failure: unknown) => {
        if (active)
          setStartupError(toError(failure))
      },
    )
    return () => {
      active = false
    }
  }, [])

  const prepare = useCallback((active: ActiveLearningReview) => {
    const request = model.preparation(active, preparationRevision.current)
    const requestId = ++preparationRequest.current
    setPrepared(null)
    if (!request)
      return
    void Promise.all(request.targetIds.map(async targetId => (
      [targetId, await callbacks.current.prepareReview(targetId)] as const
    ))).then(
      (values) => {
        if (requestId === preparationRequest.current)
          setPrepared(new Map(values))
      },
      (failure: unknown) => {
        if (requestId === preparationRequest.current)
          setActionError(toError(failure))
      },
    )
  }, [model])

  const loadNext = useCallback(async (queueMode = mode) => {
    const requestId = ++loadRequest.current
    preparationRequest.current += 1
    setPrepared(null)
    setActionError(null)
    setView({ status: 'loading' })
    try {
      const seed = await callbacks.current.loadNext(queueMode)
      if (requestId !== loadRequest.current)
        return
      if (!seed) {
        setView({ status: 'complete' })
        return
      }
      const resolved = resolveSeed(seed)
      const active = model.activate(resolved.item)
      setView({ active, note: resolved.note, status: 'active' })
      prepare(active)
    }
    catch (failure) {
      if (requestId === loadRequest.current)
        setView({ error: toError(failure), status: 'error' })
    }
  }, [mode, model, prepare])

  useEffect(() => {
    void loadNext(mode)
  }, [loadNext, mode])

  const reveal = useCallback(() => {
    if (view.status !== 'active' || view.active.revealed)
      return
    const active = { ...view.active, revealed: true, sourceVisible: false }
    setView({ ...view, active })
    prepare(active)
  }, [prepare, view])

  const rate = useCallback(async (rating: ReviewRating) => {
    if (view.status !== 'active' || !view.active.revealed || !prepared || actionPending)
      return
    setActionPending(true)
    setActionError(null)
    try {
      const decision = await model.rate(view.active, rating, prepared)
      setHistory(current => [...current, {
        active: view.active,
        note: view.note,
        undoCommands: decision.status === 'committed' ? decision.undoCommands : [],
      }])
      if (decision.status === 'advance') {
        const active = model.activate(view.active.item, {
          listRatings: decision.listRatings,
          targetId: decision.nextTargetId,
        })
        setView({ ...view, active })
        prepare(active)
      }
      else {
        await loadNext()
      }
    }
    catch (failure) {
      preparationRevision.current += 1
      setActionError(toError(failure))
      prepare(view.active)
    }
    finally {
      setActionPending(false)
    }
  }, [actionPending, loadNext, model, prepare, prepared, view])

  const undo = useCallback(async () => {
    const previous = history.at(-1)
    if (!previous || actionPending)
      return
    setActionPending(true)
    setActionError(null)
    try {
      await model.undo(previous.undoCommands)
      const active = model.activate(previous.active.item, {
        forgottenItemBlockIds: [...previous.active.forgottenItemBlockIds],
        listRatings: previous.active.listRatings,
        revealed: true,
        targetId: previous.active.targetId,
      })
      setHistory(current => current.slice(0, -1))
      setView({ active, note: previous.note, status: 'active' })
      prepare(active)
    }
    catch (failure) {
      setActionError(toError(failure))
    }
    finally {
      setActionPending(false)
    }
  }, [actionPending, history, model, prepare])

  const toggleForgotten = useCallback((itemBlockId: string) => {
    if (view.status !== 'active')
      return
    setView({ ...view, active: model.toggleForgotten(view.active, itemBlockId) })
  }, [model, view])

  const toggleSource = useCallback(() => {
    if (view.status !== 'active' || view.active.item.card.kind === 'image-occlusion')
      return
    setView({ ...view, active: { ...view.active, sourceVisible: !view.active.sourceVisible } })
  }, [view])

  if (startupError)
    return <main {...stylex.props(styles.root)}><p {...stylex.props(styles.actionError)} role="alert">{startupError.message}</p></main>
  if (!i18nReady)
    return <div {...stylex.props(styles.status)} aria-busy="true">Loading review...</div>

  const modeButtons = (
    <div {...stylex.props(styles.modes)} role="tablist" aria-label="Review queue">
      {(['mixed', 'new', 'review'] as const).map(candidate => (
        <button
          key={candidate}
          {...stylex.props(styles.modeButton, candidate === mode && styles.modeButtonSelected)}
          aria-selected={candidate === mode}
          role="tab"
          type="button"
          onClick={() => setMode(candidate)}
        >
          {candidate === 'mixed' ? 'All' : candidate === 'new' ? 'New' : 'Review'}
        </button>
      ))}
    </div>
  )
  const activeProjection = view.status === 'active' ? model.project(view.active) : null

  return (
    <I18nextProvider i18n={i18next}>
      <main {...stylex.props(styles.root)}>
        <header {...stylex.props(styles.header)}>
          {view.status === 'active'
            ? (
                <div {...stylex.props(styles.headerText)}>
                  <p {...stylex.props(styles.noteTitle)}>{view.active.item.noteTitle}</p>
                  <p {...stylex.props(styles.topicTitle)}>{view.active.item.topicTitle}</p>
                </div>
              )
            : <div />}
          {modeButtons}
        </header>
        {view.status === 'loading'
          ? <div {...stylex.props(styles.status)} aria-busy="true">Loading next Card...</div>
          : view.status === 'error'
            ? (
                <div {...stylex.props(styles.completion)}>
                  <div>
                    <p {...stylex.props(styles.actionError)} role="alert">{view.error.message}</p>
                    <button {...stylex.props(styles.secondaryButton)} type="button" onClick={() => void loadNext()}>Retry</button>
                  </div>
                </div>
              )
            : view.status === 'complete'
              ? (
                  <div {...stylex.props(styles.completion)}>
                    <div>
                      <h1 {...stylex.props(styles.completionTitle)}>Review complete</h1>
                      {history.length > 0
                        ? <button {...stylex.props(styles.secondaryButton)} disabled={actionPending} type="button" onClick={() => void undo()}>Undo last rating</button>
                        : null}
                    </div>
                  </div>
                )
              : (
                  <>
                    <div {...stylex.props(styles.card)}>
                      <CardMaterial
                        active={view.active}
                        note={view.note}
                        onToggleForgotten={toggleForgotten}
                        projection={activeProjection ?? model.project(view.active)}
                      />
                    </div>
                    <div {...stylex.props(styles.dock)}>
                      {actionError ? <p {...stylex.props(styles.actionError)} role="alert">{actionError.message}</p> : null}
                      {!view.active.revealed
                        ? (
                            <button {...stylex.props(styles.showAnswerButton)} disabled={actionPending} type="button" onClick={reveal}>
                              Show answer
                            </button>
                          )
                        : (
                            <div {...stylex.props(styles.ratingGrid)} aria-label="Rate Card" role="group">
                              {ratings.map((rating) => {
                                const intervals = prepared
                                  ? model.ratingIntervals(view.active, prepared, rating)
                                  : null
                                return (
                                  <button
                                    key={rating}
                                    {...stylex.props(styles.ratingButton)}
                                    disabled={actionPending || intervals === null}
                                    type="button"
                                    onClick={() => void rate(rating)}
                                  >
                                    <span {...stylex.props(styles.ratingInterval)}>
                                      {intervals ? intervalLabel(intervals.maximum) : '...'}
                                    </span>
                                    <span {...stylex.props(styles.ratingLabel)}>{rating}</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                      <div {...stylex.props(styles.secondaryActions)}>
                        <button {...stylex.props(styles.secondaryButton)} disabled={history.length === 0 || actionPending} type="button" onClick={() => void undo()}>
                          Undo
                        </button>
                        {view.active.item.card.kind !== 'image-occlusion'
                          ? (
                              <button {...stylex.props(styles.secondaryButton)} disabled={actionPending} type="button" onClick={toggleSource}>
                                {view.active.sourceVisible ? 'Show Card' : 'Show Source'}
                              </button>
                            )
                          : null}
                      </div>
                    </div>
                  </>
                )}
      </main>
    </I18nextProvider>
  )
}
