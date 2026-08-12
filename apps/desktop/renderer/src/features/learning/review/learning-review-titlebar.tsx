import type { DesktopLearningApi } from '@memorilo/desktop-preload'
import type { TFunction } from 'i18next'
import type { ActiveReview, ReviewProjection } from './learning-review-rating-model'
import type { LearningReviewRoute } from './learning-review-route'
import * as stylex from '@stylexjs/stylex'
import { Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, RotateCcw, X } from 'lucide-react'
import { motion } from 'motion/react'
import { learningReviewSpring } from './learning-review-page.stylex'
import { learningReviewTitlebarStyles as styles } from './learning-review-titlebar.stylex'

type DailyProgress = Awaited<ReturnType<DesktopLearningApi['getDailyProgress']>>

export function LearningReviewTitlebar({
  actionPending,
  active,
  activeProjection,
  dailyProgress,
  historyLength,
  onToggleSource,
  onUndo,
  scope,
  shouldReduceMotion,
  t,
}: {
  actionPending: boolean
  active: ActiveReview | null
  activeProjection: ReviewProjection | null
  dailyProgress: DailyProgress | undefined
  historyLength: number
  onToggleSource: () => void
  onUndo: () => Promise<void>
  scope: LearningReviewRoute['scope']
  shouldReduceMotion: boolean | null
  t: TFunction
}) {
  let cardPosition: string | null = null
  if (activeProjection) {
    cardPosition = activeProjection.position.kind === 'sequential'
      ? t('cardItemProgress', {
          count: activeProjection.position.current,
          total: activeProjection.position.total,
        })
      : t(`phase.${activeProjection.position.phase}`)
  }

  const progressMaximum = dailyProgress === undefined
    ? 1
    : Math.max(dailyProgress.dailyGoalCards, dailyProgress.completedCards, 1)
  const progressValue = dailyProgress === undefined
    ? 0
    : Math.min(progressMaximum, dailyProgress.completedCards)

  return (
    <div {...stylex.props(styles.sessionBar)} data-review-session-titlebar="">
      <Link
        {...stylex.props(styles.iconButton)}
        aria-label={t('closeReview')}
        search={{}}
        title={t('closeReview')}
        to="/learning"
      >
        <X aria-hidden="true" size={17} strokeWidth={1.9} />
      </Link>
      <div {...stylex.props(styles.identity)}>
        <span {...stylex.props(styles.scopeLabel)}>
          {scope === 'global' ? t('globalReview') : t('noteReview')}
        </span>
        {active
          ? (
              <span {...stylex.props(styles.location)}>
                <span {...stylex.props(styles.locationText)}>{active.item.noteTitle}</span>
                {active.item.topicTitle === active.item.noteTitle
                  ? null
                  : (
                      <>
                        <ChevronRight {...stylex.props(styles.locationChevron)} aria-hidden="true" size={12} strokeWidth={1.9} />
                        <span {...stylex.props(styles.locationText)}>{active.item.topicTitle}</span>
                      </>
                    )}
              </span>
            )
          : null}
      </div>
      {active
        ? (
            <div {...stylex.props(styles.sessionMeta)}>
              <span {...stylex.props(styles.cardPosition)}>{cardPosition}</span>
              <div
                {...stylex.props(styles.progressTrack)}
                aria-label={t('dailyProgress')}
                aria-valuemax={progressMaximum}
                aria-valuemin={0}
                aria-valuenow={progressValue}
                role="progressbar"
              >
                <motion.span
                  {...stylex.props(styles.progressFill)}
                  animate={{ scaleX: progressValue / progressMaximum }}
                  initial={false}
                  transition={shouldReduceMotion ? { duration: 0 } : learningReviewSpring}
                />
              </div>
              <button
                {...stylex.props(styles.iconButton)}
                aria-label={t('undoRating')}
                disabled={historyLength === 0 || actionPending}
                title={t('undoRating')}
                type="button"
                onClick={() => void onUndo()}
              >
                <RotateCcw aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
              <button
                {...stylex.props(styles.iconButton, active.sourceVisible && styles.iconButtonActive)}
                aria-label={active.sourceVisible ? t('showCard') : t('showSource')}
                aria-pressed={active.sourceVisible}
                disabled={!active.revealed}
                title={active.sourceVisible ? t('showCard') : t('showSource')}
                type="button"
                onClick={onToggleSource}
              >
                <BookOpen aria-hidden="true" size={17} strokeWidth={1.8} />
              </button>
            </div>
          )
        : null}
    </div>
  )
}
