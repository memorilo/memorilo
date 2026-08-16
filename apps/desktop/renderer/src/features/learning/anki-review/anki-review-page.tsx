import type { AnkiReviewRating } from '@memorilo/anki-connect'
import type { DesktopAnkiDeck, DesktopAnkiReviewerCard } from '@memorilo/desktop-api'
import { AnkiConnectInputError, AnkiConnectNetworkError, resolveAnkiCardMedia } from '@memorilo/anki-connect'
import { AnkiNoteRenderer } from '@memorilo/anki-connect/renderer'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Effect } from 'effect'
import { Check, LoaderCircle, Volume2, X } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopRequests } from '../../../shared/desktop-requests'

import { desktopEffect, desktopEffectQuery } from '../../../shared/effect-query'
import { usePageTitlebar } from '../../../shared/page-titlebar'
import { PageTitlebarButton } from '../../../shared/page-titlebar-button'
import { learningQueryKeys } from '../query-keys'
import { ReviewCardSession } from '../review/review-card-session'
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
  const reviewQuery = useQuery(desktopEffectQuery.queryOptions({
    queryFn: () => desktopEffect('learning.start-anki-review', () => (
      desktopRequests.learning.startAnkiDeckReview(deck)
    )),
    queryKey: reviewKey,
    refetchOnMount: 'always',
    staleTime: 0,
  }))
  const card = reviewQuery.data ?? null
  const revealed = card !== null && revealedCardId === card.cardId
  const mediaClient = useMemo(() => ({
    retrieveMediaFile: (filename: string) => Effect.tryPromise({
      try: () => desktopRequests.learning.retrieveAnkiMediaFile(filename),
      catch: cause => new AnkiConnectNetworkError('Failed to retrieve Anki media through the desktop bridge', {
        action: 'retrieveMediaFile',
        cause,
      }),
    }),
  }), [])
  const mediaQuery = useQuery(desktopEffectQuery.queryOptions({
    enabled: card !== null,
    queryFn: () => {
      if (!card)
        return Effect.fail(new AnkiConnectInputError('Anki card media requires an active reviewer card'))
      return resolveAnkiCardMedia(mediaClient, card)
    },
    queryKey: card ? learningQueryKeys.ankiCardMedia(card.cardId) : ['learning', 'anki-review', 'media', 'none'],
    staleTime: Number.POSITIVE_INFINITY,
  }))
  const showAnswer = useMutation(desktopEffectQuery.mutationOptions({
    mutationFn: (current: DesktopAnkiReviewerCard) => desktopEffect('learning.show-anki-answer', () => (
      desktopRequests.learning.showAnkiReviewAnswer({ cardId: current.cardId })
    )),
    onSuccess: current => setRevealedCardId(current.cardId),
  }))
  const rate = useMutation(desktopEffectQuery.mutationOptions({
    mutationFn: ({ current, rating }: { current: DesktopAnkiReviewerCard, rating: AnkiReviewRating }) => (
      desktopEffect('learning.answer-anki-card', () => (
        desktopRequests.learning.answerAnkiReviewCard({ cardId: current.cardId, rating })
      ))
    ),
    onSuccess: (next) => {
      setRevealedCardId(null)
      queryClient.setQueryData(reviewKey, next)
      void queryClient.invalidateQueries({ queryKey: learningQueryKeys.ankiDecksRoot })
    },
  }))
  const playAudio = useMutation(desktopEffectQuery.mutationOptions({
    mutationFn: (current: DesktopAnkiReviewerCard) => desktopEffect('learning.play-anki-audio', () => (
      desktopRequests.learning.playAnkiReviewAudio({ cardId: current.cardId })
    )),
  }))
  const closeReview = useMutation(desktopEffectQuery.mutationOptions({
    mutationFn: () => desktopEffect('learning.end-anki-review', () => desktopRequests.learning.endAnkiReview()),
    onSuccess: () => onClose(),
  }))
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
        void desktopRequests.learning.endAnkiReview().catch(error => console.error('Failed to close Anki review', error))
      }, 0)
    }
  }, [])

  const close = useCallback(() => {
    closeReview.mutate(undefined)
  }, [closeReview])
  const play = useCallback(() => {
    if (card)
      playAudio.mutate(card)
  }, [card, playAudio])
  const titlebar = useMemo(() => ({
    title: deck.name,
    trailing: (
      <div {...stylex.props(styles.titlebarActions)}>
        <PageTitlebarButton
          disabled={!card || playAudio.isPending}
          label={t('playAnkiAudio')}
          title={t('playAnkiAudio')}
          onClick={play}
        >
          <Volume2 aria-hidden="true" size={16} strokeWidth={1.8} />
        </PageTitlebarButton>
        <PageTitlebarButton
          disabled={closeReview.isPending}
          label={t('closeReview')}
          title={t('closeReview')}
          onClick={close}
        >
          <X aria-hidden="true" size={16} strokeWidth={1.9} />
        </PageTitlebarButton>
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

  const reviewRatings = card.answerOptions.map(option => ({
    id: option.rating,
    interval: option.nextReview,
    label: t(`rating.${ratingNames[option.rating]}`),
    tone: ratingNames[option.rating],
  }))

  return (
    <ReviewCardSession
      actionError={actionError ? errorMessage(actionError) : null}
      actionPending={actionPending}
      ariaLabel={t('ankiReview')}
      dataAttributes={{ 'data-anki-card-id': card.cardId }}
      materialAriaLabel={revealed ? t('ankiAnswer') : t('ankiQuestion')}
      materialKey={String(card.cardId)}
      pendingLabel={showAnswer.isPending ? t('showAnswer') : t('savingRating')}
      rateAriaLabel={t('rateCard')}
      ratings={reviewRatings}
      revealed={revealed}
      revealDisabled={actionPending}
      shouldReduceMotion={shouldReduceMotion}
      showAnswerLabel={t('showAnswer')}
      onRate={rating => rate.mutate({ current: card, rating })}
      onReveal={() => showAnswer.mutate(card)}
    >
      {mediaQuery.isError
        ? <p {...stylex.props(styles.mediaWarning)} role="alert">{t('ankiMediaFailed', { message: errorMessage(mediaQuery.error) })}</p>
        : null}
      <AnkiNoteRenderer card={card} media={mediaQuery.data} side={revealed ? 'answer' : 'question'} />
    </ReviewCardSession>
  )
}
