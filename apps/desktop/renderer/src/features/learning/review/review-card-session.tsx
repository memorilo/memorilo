import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { LoaderCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { learningReviewSpring, learningReviewPageStyles as styles } from './learning-review-page.stylex'

export type ReviewCardRatingTone = 'again' | 'easy' | 'good' | 'hard'

export interface ReviewCardRating<Rating extends number | string> {
  id: Rating
  interval: ReactNode
  label: ReactNode
  tone: ReviewCardRatingTone
}

type ReviewDataAttributes = Record<`data-${string}`, number | string>

function ratingToneStyle(tone: ReviewCardRatingTone) {
  if (tone === 'again')
    return styles.rating_again
  if (tone === 'hard')
    return styles.rating_hard
  if (tone === 'good')
    return styles.rating_good
  return styles.rating_easy
}

export function ReviewCardSession<Rating extends number | string>({
  actionError,
  actionPending,
  ariaLabel,
  children,
  dataAttributes,
  materialAriaLabel,
  materialDataAttributes,
  materialKey,
  onRate,
  onReveal,
  rateAriaLabel,
  ratingsDisabled = false,
  ratings,
  revealed,
  revealDisabled = false,
  pendingLabel,
  shouldReduceMotion,
  showAnswerLabel,
}: {
  actionError: ReactNode | null
  actionPending: boolean
  ariaLabel: string
  children: ReactNode
  dataAttributes?: ReviewDataAttributes
  materialAriaLabel: string
  materialDataAttributes?: ReviewDataAttributes
  materialKey: string
  onRate: (rating: Rating) => void
  onReveal: () => void
  rateAriaLabel: string
  ratingsDisabled?: boolean
  ratings: readonly ReviewCardRating<Rating>[]
  revealed: boolean
  revealDisabled?: boolean
  pendingLabel: string
  shouldReduceMotion: boolean | null
  showAnswerLabel: string
}) {
  return (
    <main
      {...stylex.props(styles.page, styles.session)}
      {...dataAttributes}
      aria-label={ariaLabel}
    >
      <div {...stylex.props(styles.materialViewport)}>
        <AnimatePresence initial={false} mode="wait">
          <motion.section
            key={materialKey}
            {...stylex.props(styles.material)}
            {...materialDataAttributes}
            animate={{ opacity: 1, y: 0 }}
            aria-label={materialAriaLabel}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={shouldReduceMotion ? { duration: 0.08 } : learningReviewSpring}
          >
            {children}
          </motion.section>
        </AnimatePresence>
      </div>

      <div {...stylex.props(styles.dockRegion)}>
        <div {...stylex.props(styles.reviewDock)}>
          {actionError
            ? <p {...stylex.props(styles.inlineError)} role="alert">{actionError}</p>
            : null}
          {!revealed
            ? (
                <button
                  {...stylex.props(styles.showAnswerButton)}
                  disabled={revealDisabled}
                  type="button"
                  onClick={onReveal}
                >
                  {showAnswerLabel}
                </button>
              )
            : (
                <div {...stylex.props(styles.ratingGrid)} aria-label={rateAriaLabel} role="group">
                  {ratings.map(rating => (
                    <button
                      key={String(rating.id)}
                      {...stylex.props(styles.ratingButton, ratingToneStyle(rating.tone))}
                      disabled={actionPending || ratingsDisabled}
                      type="button"
                      onClick={() => onRate(rating.id)}
                    >
                      <span {...stylex.props(styles.ratingInterval)}>{rating.interval}</span>
                      <span {...stylex.props(styles.ratingLabel)}>{rating.label}</span>
                    </button>
                  ))}
                </div>
              )}
          {actionPending
            ? <LoaderCircle {...stylex.props(styles.dockSpinner, styles.spinner)} aria-label={pendingLabel} size={15} />
            : null}
        </div>
      </div>
    </main>
  )
}
