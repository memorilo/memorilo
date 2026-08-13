import type { AnkiReviewRating } from '@memorilo/anki-connect'
import type { DesktopAnkiDeck, DesktopAnkiReviewerCard } from '@memorilo/desktop-preload'
import { AnkiConnectNetworkError, resolveAnkiCardMedia } from '@memorilo/anki-connect'
import { AnkiNoteRenderer } from '@memorilo/anki-connect/renderer'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Effect } from 'effect'
import { Check, LoaderCircle, Volume2, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitlebar } from '../../../shared/page-titlebar'
import { learningQueryKeys } from '../query-keys'
import { ankiReviewPageStyles as styles } from './anki-review-page.stylex'

let pendingReviewClose: ReturnType<typeof setTimeout> | null = null

const ratingNames = {
  1: 'again',
  2: 'hard',
  3: 'good',
  4: 'easy',
} as const

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function ignoresReviewShortcut(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('button, a, input, select, textarea, [contenteditable="true"]') !== null
}

export function AnkiReviewPage({
  deck,
  onClose,
}: {
  deck: DesktopAnkiDeck
  onClose: () => Promise<void> | void
}) {
  const { t } = useTranslation('learning')
  const queryClient = useQueryClient()
  const shouldReduceMotion = useReducedMotion()
  const [revealedCardId, setRevealedCardId] = useState<number | null>(null)
  const reviewKey = learningQueryKeys.ankiReview(deck.id)
  const reviewQuery = useQuery({
    queryFn: () => window.desktop.learning.startAnkiDeckReview(deck),
    queryKey: reviewKey,
    refetchOnMount: 'always',
    staleTime: 0,
  })
  const card = reviewQuery.data ?? null
  const revealed = card !== null && revealedCardId === card.cardId
  const mediaClient = useMemo(() => ({
    retrieveMediaFile: (filename: string) => Effect.tryPromise({
      try: () => window.desktop.learning.retrieveAnkiMediaFile(filename),
      catch: cause => new AnkiConnectNetworkError('Failed to retrieve Anki media through the desktop bridge', {
        action: 'retrieveMediaFile',
        cause,
      }),
    }),
  }), [])
  const mediaQuery = useQuery({
    enabled: card !== null,
    queryFn: () => {
      if (!card)
        throw new Error('Anki card media requires an active reviewer card')
      return Effect.runPromise(resolveAnkiCardMedia(mediaClient, card))
    },
    queryKey: card ? learningQueryKeys.ankiCardMedia(card.cardId) : ['learning', 'anki-review', 'media', 'none'],
    staleTime: Number.POSITIVE_INFINITY,
  })
  const showAnswer = useMutation({
    mutationFn: (current: DesktopAnkiReviewerCard) => window.desktop.learning.showAnkiReviewAnswer({ cardId: current.cardId }),
    onSuccess: current => setRevealedCardId(current.cardId),
  })
  const rate = useMutation({
    mutationFn: ({ current, rating }: { current: DesktopAnkiReviewerCard, rating: AnkiReviewRating }) => (
      window.desktop.learning.answerAnkiReviewCard({ cardId: current.cardId, rating })
    ),
    onSuccess: (next) => {
      setRevealedCardId(null)
      queryClient.setQueryData(reviewKey, next)
      void queryClient.invalidateQueries({ queryKey: learningQueryKeys.ankiDecksRoot })
    },
  })
  const playAudio = useMutation({
    mutationFn: (current: DesktopAnkiReviewerCard) => window.desktop.learning.playAnkiReviewAudio({ cardId: current.cardId }),
  })
  const closeReview = useMutation({
    mutationFn: () => window.desktop.learning.endAnkiReview(),
    onSuccess: () => onClose(),
  })
  const actionPending = showAnswer.isPending || rate.isPending
  const actionError = showAnswer.error ?? rate.error ?? playAudio.error

  useEffect(() => {
    if (pendingReviewClose) {
      clearTimeout(pendingReviewClose)
      pendingReviewClose = null
    }
    return () => {
      pendingReviewClose = setTimeout(() => {
        pendingReviewClose = null
        void window.desktop.learning.endAnkiReview().catch(error => console.error('Failed to close Anki review', error))
      }, 0)
    }
  }, [])

  const close = useCallback(() => {
    closeReview.mutate()
  }, [closeReview])
  const play = useCallback(() => {
    if (card)
      playAudio.mutate(card)
  }, [card, playAudio])
  const titlebar = useMemo(() => ({
    title: deck.name,
    trailing: (
      <div {...stylex.props(styles.titlebarActions)}>
        <button
          {...stylex.props(styles.titlebarButton)}
          aria-label={t('playAnkiAudio')}
          disabled={!card || playAudio.isPending}
          title={t('playAnkiAudio')}
          type="button"
          onClick={play}
        >
          <Volume2 aria-hidden="true" size={16} strokeWidth={1.8} />
        </button>
        <button
          {...stylex.props(styles.titlebarButton)}
          aria-label={t('closeReview')}
          disabled={closeReview.isPending}
          title={t('closeReview')}
          type="button"
          onClick={close}
        >
          <X aria-hidden="true" size={16} strokeWidth={1.9} />
        </button>
      </div>
    ),
  }), [card, close, closeReview.isPending, deck.name, play, playAudio.isPending, t])
  usePageTitlebar(titlebar)

  useEffect(() => {
    if (!card || actionPending)
      return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ignoresReviewShortcut(event.target))
        return
      if (!revealed && event.code === 'Space') {
        event.preventDefault()
        showAnswer.mutate(card)
        return
      }
      if (!revealed)
        return
      const rating = event.key === '1'
        ? 1
        : event.key === '2' ? 2 : event.key === '3' ? 3 : event.key === '4' ? 4 : null
      if (rating !== null && card.answerOptions.some(option => option.rating === rating)) {
        event.preventDefault()
        rate.mutate({ current: card, rating })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actionPending, card, rate, revealed, showAnswer])

  if (reviewQuery.isPending) {
    return (
      <main {...stylex.props(styles.page)} aria-label={t('ankiReview')}>
        <div {...stylex.props(styles.centered)} role="status">
          <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={18} />
          <span>{t('loadingAnkiReview')}</span>
        </div>
      </main>
    )
  }

  if (reviewQuery.isError) {
    return (
      <main {...stylex.props(styles.page)} aria-label={t('ankiReview')}>
        <div {...stylex.props(styles.centered)} role="alert">
          <h1 {...stylex.props(styles.statusTitle)}>{t('ankiReviewUnavailable')}</h1>
          <p {...stylex.props(styles.statusMessage)}>{errorMessage(reviewQuery.error)}</p>
          <div {...stylex.props(styles.statusActions)}>
            <Link {...stylex.props(styles.statusButton)} search={{}} to="/learning">{t('backToLearning')}</Link>
            <button {...stylex.props(styles.statusButton)} type="button" onClick={() => void reviewQuery.refetch()}>{t('retry')}</button>
          </div>
        </div>
      </main>
    )
  }

  if (!card) {
    return (
      <main {...stylex.props(styles.page)} aria-label={t('ankiReview')}>
        <div {...stylex.props(styles.centered)}>
          <Check aria-hidden="true" size={28} strokeWidth={1.8} />
          <h1 {...stylex.props(styles.statusTitle)}>{t('ankiReviewComplete')}</h1>
          <p {...stylex.props(styles.statusMessage)}>{t('ankiReviewCompleteDescription')}</p>
          <button {...stylex.props(styles.statusButton)} type="button" onClick={close}>{t('backToLearning')}</button>
        </div>
      </main>
    )
  }

  return (
    <main {...stylex.props(styles.page)} aria-label={t('ankiReview')} data-anki-card-id={card.cardId}>
      <div {...stylex.props(styles.viewport)}>
        <AnimatePresence initial={false} mode="wait">
          <motion.section
            key={`${card.cardId}:${revealed ? 'answer' : 'question'}`}
            {...stylex.props(styles.card)}
            animate={{ opacity: 1, y: 0 }}
            aria-label={revealed ? t('ankiAnswer') : t('ankiQuestion')}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={shouldReduceMotion ? { duration: 0.08 } : { bounce: 0, type: 'spring', visualDuration: 0.24 }}
          >
            {mediaQuery.isError
              ? <p {...stylex.props(styles.mediaWarning)} role="alert">{t('ankiMediaFailed', { message: errorMessage(mediaQuery.error) })}</p>
              : null}
            <AnkiNoteRenderer card={card} media={mediaQuery.data} side={revealed ? 'answer' : 'question'} />
          </motion.section>
        </AnimatePresence>
      </div>
      <div {...stylex.props(styles.dockRegion)}>
        <div {...stylex.props(styles.dock)}>
          {actionError
            ? <p {...stylex.props(styles.inlineError)} role="alert">{errorMessage(actionError)}</p>
            : null}
          {!revealed
            ? (
                <button
                  {...stylex.props(styles.showAnswerButton)}
                  disabled={actionPending}
                  type="button"
                  onClick={() => showAnswer.mutate(card)}
                >
                  {t('showAnswer')}
                </button>
              )
            : (
                <div {...stylex.props(styles.ratingGrid)} aria-label={t('rateCard')} role="group">
                  {card.answerOptions.map(option => (
                    <button
                      key={option.rating}
                      {...stylex.props(styles.ratingButton, styles[`rating_${option.rating}`])}
                      disabled={actionPending}
                      type="button"
                      onClick={() => rate.mutate({ current: card, rating: option.rating })}
                    >
                      <span {...stylex.props(styles.ratingInterval)}>{option.nextReview}</span>
                      <span {...stylex.props(styles.ratingLabel)}>{t(`rating.${ratingNames[option.rating]}`)}</span>
                    </button>
                  ))}
                </div>
              )}
        </div>
      </div>
    </main>
  )
}
