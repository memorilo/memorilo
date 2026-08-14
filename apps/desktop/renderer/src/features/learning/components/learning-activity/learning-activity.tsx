import type { DesktopLearningApi } from '@memorilo/desktop-preload'
import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock3, Flame, RefreshCw, ShieldCheck } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { learningQueryKeys } from '../../query-keys'
import { learningActivityStyles as styles } from './learning-activity.stylex'

const activityPeriodDays = 364
const sparklineDays = 28
const sparklineWidth = 156
const sparklineHeight = 38

type ActivitySummary = Awaited<ReturnType<DesktopLearningApi['getActivitySummary']>>

function sparklinePath(values: readonly number[]): { area: string, line: string } {
  if (values.length < 2)
    throw new RangeError('A learning activity sparkline requires at least two values')
  const maximum = Math.max(...values, 1)
  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * sparklineWidth,
    y: sparklineHeight - 3 - (value / maximum) * (sparklineHeight - 8),
  }))
  const line = points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
  )).join(' ')
  return {
    area: `${line} L ${sparklineWidth} ${sparklineHeight} L 0 ${sparklineHeight} Z`,
    line,
  }
}

function activityCellStyle(reviewedCards: number, maximum: number) {
  if (reviewedCards === 0)
    return styles.activityCellEmpty
  const intensity = reviewedCards / maximum
  if (intensity <= 0.25)
    return styles.activityCellLow
  if (intensity <= 0.5)
    return styles.activityCellMedium
  if (intensity <= 0.75)
    return styles.activityCellHigh
  return styles.activityCellPeak
}

function ActivityMetric({
  icon,
  label,
  tone,
  value,
}: {
  icon: ReactNode
  label: string
  tone: stylex.StyleXStyles
  value: string
}) {
  return (
    <div {...stylex.props(styles.metric)}>
      <span {...stylex.props(styles.metricIcon, tone)}>{icon}</span>
      <span {...stylex.props(styles.metricText)}>
        <span {...stylex.props(styles.metricLabel)}>{label}</span>
        <span {...stylex.props(styles.metricValue)}>{value}</span>
      </span>
    </div>
  )
}

function LearningActivityContent({
  isRefreshing,
  onRefresh,
  summary,
}: {
  isRefreshing: boolean
  onRefresh: () => void
  summary: ActivitySummary
}) {
  const { i18n, t } = useTranslation('learning')
  const shouldReduceMotion = useReducedMotion()
  const activityScrollRef = useRef<HTMLDivElement>(null)
  if (summary.days.length < sparklineDays)
    throw new RangeError(`Learning activity returned only ${summary.days.length} days`)
  const today = summary.days.at(-1)
  const firstDay = summary.days[0]
  if (!today || !firstDay)
    throw new Error('Learning activity summary did not include its requested date range')

  const progress = summary.dailyProgress
  const progressMaximum = Math.max(progress.dailyGoalCards, progress.completedCards, 1)
  const progressPercent = Math.min(100, (progress.completedCards / progressMaximum) * 100)
  const progressPercentLabel = `${Math.round(progressPercent)}%`
  const todayRetention = today.reviewCount === 0
    ? null
    : Math.round((today.successfulReviewCount / today.reviewCount) * 100)
  const maximumReviewedCards = Math.max(...summary.days.map(day => day.reviewedCards), 1)
  const sparkline = sparklinePath(summary.days.slice(-sparklineDays).map(day => day.reviewedCards))
  const leadingEmptyDays = (new Date(firstDay.studyDayStartedAt).getDay() + 6) % 7
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
  }), [i18n.language])
  const weekdayFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    weekday: 'narrow',
  }), [i18n.language])
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2024, 0, 1 + index)
    return { key: date.getTime(), label: weekdayFormatter.format(date) }
  }), [weekdayFormatter])

  useLayoutEffect(() => {
    const activityScroll = activityScrollRef.current
    if (!activityScroll)
      throw new Error('Learning activity scroll container was not mounted')
    activityScroll.scrollLeft = activityScroll.scrollWidth
  }, [summary.days])

  return (
    <motion.section
      {...stylex.props(styles.panel)}
      animate={{ opacity: 1, y: 0 }}
      aria-labelledby="learning-activity-title"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 7 }}
      transition={shouldReduceMotion
        ? { duration: 0 }
        : { bounce: 0, type: 'spring', visualDuration: 0.3 }}
    >
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <h2 {...stylex.props(styles.title)} id="learning-activity-title">{t('activityTitle')}</h2>
          <span {...stylex.props(styles.period)}>
            {t('activityPeriod', { count: Math.ceil(summary.days.length / 7) })}
          </span>
        </div>
        <button
          {...stylex.props(styles.refreshButton)}
          aria-label={t('refreshActivity')}
          disabled={isRefreshing}
          title={t('refreshActivity')}
          type="button"
          onClick={onRefresh}
        >
          <RefreshCw
            {...stylex.props(isRefreshing && styles.refreshing)}
            aria-hidden="true"
            size={14}
            strokeWidth={1.8}
          />
        </button>
      </header>

      <div {...stylex.props(styles.summary)}>
        <div {...stylex.props(styles.metrics)}>
          <ActivityMetric
            icon={<CheckCircle2 aria-hidden="true" size={15} strokeWidth={1.9} />}
            label={t('activityToday')}
            tone={styles.metricIconBlue}
            value={`${progress.completedCards} / ${progress.dailyGoalCards}`}
          />
          <ActivityMetric
            icon={<Clock3 aria-hidden="true" size={15} strokeWidth={1.9} />}
            label={t('activityDue')}
            tone={styles.metricIconNeutral}
            value={String(progress.dueReviewCards)}
          />
          <ActivityMetric
            icon={<Flame aria-hidden="true" size={15} strokeWidth={1.9} />}
            label={t('activityStreak')}
            tone={styles.metricIconWarm}
            value={t('activityStreakValue', { count: summary.currentStreakDays })}
          />
          <ActivityMetric
            icon={<ShieldCheck aria-hidden="true" size={15} strokeWidth={1.9} />}
            label={t('activityRetention')}
            tone={styles.metricIconGreen}
            value={todayRetention === null ? '—' : `${todayRetention}%`}
          />
        </div>

        <div {...stylex.props(styles.trend)}>
          <span {...stylex.props(styles.trendLabel)}>{t('activityTrend')}</span>
          <svg
            {...stylex.props(styles.sparkline)}
            aria-label={t('activityTrendLabel')}
            role="img"
            viewBox={`0 0 ${sparklineWidth} ${sparklineHeight}`}
          >
            <path d={sparkline.area} fill="currentColor" opacity="0.08" />
            <motion.path
              d={sparkline.line}
              fill="none"
              initial={shouldReduceMotion ? false : { pathLength: 0, opacity: 0.35 }}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }}
              animate={{ pathLength: 1, opacity: 1 }}
            />
          </svg>
        </div>
      </div>

      <div {...stylex.props(styles.goal)}>
        <span {...stylex.props(styles.goalLabels)}>
          <span>{t('activityGoal')}</span>
          <span>{progressPercentLabel}</span>
        </span>
        <div
          {...stylex.props(styles.goalTrack)}
          aria-label={t('activityGoalProgress')}
          aria-valuemax={progressMaximum}
          aria-valuemin={0}
          aria-valuenow={Math.min(progress.completedCards, progressMaximum)}
          role="progressbar"
        >
          <motion.span
            {...stylex.props(styles.goalFill)}
            animate={{ width: `${progressPercent}%` }}
            initial={shouldReduceMotion ? false : { width: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div {...stylex.props(styles.heatmap)}>
        <div {...stylex.props(styles.weekdays)} aria-hidden="true">
          {weekdays.map(weekday => <span key={weekday.key}>{weekday.label}</span>)}
        </div>
        <div {...stylex.props(styles.activityScroll)} ref={activityScrollRef}>
          <div
            {...stylex.props(styles.activityGrid)}
            aria-label={t('activityHeatmapLabel', { count: Math.ceil(summary.days.length / 7) })}
            role="img"
          >
            {Array.from({ length: leadingEmptyDays }, (_, index) => (
              <span key={`empty-${index}`} {...stylex.props(styles.activityCellSpacer)} />
            ))}
            {summary.days.map(day => (
              <span
                key={day.studyDayStartedAt}
                {...stylex.props(
                  styles.activityCell,
                  activityCellStyle(day.reviewedCards, maximumReviewedCards),
                  day.studyDayStartedAt === progress.studyDayStartedAt && styles.activityCellToday,
                )}
                title={t('activityDayCards', {
                  count: day.reviewedCards,
                  date: dateFormatter.format(day.studyDayStartedAt),
                })}
              />
            ))}
          </div>
        </div>
      </div>

      <div {...stylex.props(styles.legend)} aria-hidden="true">
        <span>{t('activityLess')}</span>
        <span {...stylex.props(styles.legendCell, styles.activityCellEmpty)} />
        <span {...stylex.props(styles.legendCell, styles.activityCellLow)} />
        <span {...stylex.props(styles.legendCell, styles.activityCellMedium)} />
        <span {...stylex.props(styles.legendCell, styles.activityCellHigh)} />
        <span {...stylex.props(styles.legendCell, styles.activityCellPeak)} />
        <span>{t('activityMore')}</span>
      </div>
    </motion.section>
  )
}

export function LearningActivity() {
  const { t } = useTranslation('learning')
  const activityQuery = useQuery({
    queryFn: () => window.desktop.learning.getActivitySummary({ days: activityPeriodDays }),
    queryKey: learningQueryKeys.activitySummary,
    refetchOnMount: 'always',
  })

  if (activityQuery.isPending) {
    return (
      <section {...stylex.props(styles.panel, styles.loadingPanel)} aria-label={t('activityTitle')}>
        <span {...stylex.props(styles.loadingPulse)} />
        <span {...stylex.props(styles.loadingText)}>{t('loadingActivity')}</span>
      </section>
    )
  }

  if (activityQuery.isError) {
    return (
      <section {...stylex.props(styles.panel, styles.errorPanel)} role="alert">
        <span>{t('loadActivityFailed')}</span>
        <button
          {...stylex.props(styles.retryButton)}
          type="button"
          onClick={() => void activityQuery.refetch()}
        >
          {t('retry')}
        </button>
      </section>
    )
  }

  return (
    <LearningActivityContent
      isRefreshing={activityQuery.isFetching}
      summary={activityQuery.data}
      onRefresh={() => void activityQuery.refetch()}
    />
  )
}
