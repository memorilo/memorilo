import type { DesktopLearningApi } from '@memorilo/desktop-preload'
import type { ChangeEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown, FileText, LoaderCircle, Play, SlidersHorizontal } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { learningQueryKeys } from '../query-keys'
import { learningNotesStyles as styles } from './learning-notes.stylex'

type LearningNote = Awaited<ReturnType<DesktopLearningApi['listNotesWithCards']>>[number]
type LearningOptimizer = Awaited<ReturnType<DesktopLearningApi['listOptimizers']>>[number]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function LearningNoteRow({
  index,
  note,
  optimizers,
}: {
  index: number
  note: LearningNote
  optimizers: readonly LearningOptimizer[]
}) {
  const { i18n, t } = useTranslation('learning')
  const queryClient = useQueryClient()
  const shouldReduceMotion = useReducedMotion()
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const updatedDate = useMemo(() => new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  }).format(note.updatedAt), [i18n.language, note.updatedAt])
  const assignment = useMutation({
    mutationFn: (optimizer: LearningOptimizer) => window.desktop.learning.assignNoteOptimizer({
      noteId: note.noteId,
      optimizerId: optimizer.id,
    }),
    onError: (error, _optimizer, previousNotes) => {
      if (previousNotes)
        queryClient.setQueryData(learningQueryKeys.notesWithCards, previousNotes)
      setAssignmentError(t('assignOptimizerFailed', { message: errorMessage(error) }))
    },
    onMutate: async (optimizer) => {
      setAssignmentError(null)
      await queryClient.cancelQueries({ queryKey: learningQueryKeys.notesWithCards })
      const previousNotes = queryClient.getQueryData<readonly LearningNote[]>(learningQueryKeys.notesWithCards)
      queryClient.setQueryData<readonly LearningNote[]>(learningQueryKeys.notesWithCards, current => current?.map(item => (
        item.noteId === note.noteId
          ? {
              ...item,
              optimizer: {
                id: optimizer.id,
                isGlobal: optimizer.isGlobal,
                name: optimizer.name,
              },
            }
          : item
      )))
      return previousNotes
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: learningQueryKeys.notesWithCards }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: learningQueryKeys.optimizers }),
  })

  const changeOptimizer = (event: ChangeEvent<HTMLSelectElement>) => {
    const optimizerId = event.currentTarget.value
    if (optimizerId === note.optimizer.id)
      return
    const optimizer = optimizers.find(candidate => candidate.id === optimizerId)
    if (!optimizer)
      throw new Error(`Unknown FSRS Optimizer selected: ${optimizerId}`)
    assignment.mutate(optimizer)
  }

  return (
    <motion.div
      {...stylex.props(styles.listItem)}
      animate={{ opacity: 1, y: 0 }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
      role="listitem"
      transition={shouldReduceMotion
        ? { duration: 0 }
        : { bounce: 0, delay: Math.min(index, 8) * 0.025, type: 'spring', visualDuration: 0.22 }}
    >
      <div {...stylex.props(styles.row)}>
        <span {...stylex.props(styles.noteIcon)}>
          <FileText aria-hidden="true" size={17} strokeWidth={1.7} />
        </span>
        <span {...stylex.props(styles.identity)}>
          <span {...stylex.props(styles.noteTitle)}>{note.noteTitle}</span>
          <span {...stylex.props(styles.metadata)}>
            {t('topicCount', { count: note.topicCount })}
            <span {...stylex.props(styles.metadataSeparator)} aria-hidden="true">·</span>
            {t('cardCount', { count: note.cardCount })}
            <span {...stylex.props(styles.updatedMetadata)}>
              <span {...stylex.props(styles.metadataSeparator)} aria-hidden="true">·</span>
              {t('updatedAt', { date: updatedDate })}
            </span>
          </span>
        </span>
        <span {...stylex.props(styles.optimizerControl)}>
          <span {...stylex.props(styles.optimizerField)}>
            <SlidersHorizontal {...stylex.props(styles.optimizerIcon)} aria-hidden="true" size={13} strokeWidth={1.9} />
            <select
              {...stylex.props(styles.optimizerSelect)}
              aria-label={t('noteOptimizerLabel', { note: note.noteTitle })}
              disabled={assignment.isPending}
              value={note.optimizer.id}
              onChange={changeOptimizer}
            >
              {optimizers.map(optimizer => (
                <option key={optimizer.id} value={optimizer.id}>
                  {optimizer.isGlobal ? t('globalOptimizer') : optimizer.name}
                </option>
              ))}
            </select>
            {assignment.isPending
              ? <LoaderCircle {...stylex.props(styles.optimizerStatusIcon, styles.spinner)} aria-hidden="true" size={13} />
              : <ChevronDown {...stylex.props(styles.optimizerStatusIcon)} aria-hidden="true" size={13} strokeWidth={2} />}
          </span>
          {assignmentError
            ? <span {...stylex.props(styles.assignmentError)} role="alert" title={assignmentError}>{assignmentError}</span>
            : null}
        </span>
        <Link
          {...stylex.props(styles.studyButton)}
          aria-label={t('startNoteReview', { note: note.noteTitle })}
          search={{ scope: 'note', scopeNoteId: note.noteId }}
          title={t('startNoteReview', { note: note.noteTitle })}
          to="/learning/review"
        >
          <Play aria-hidden="true" fill="currentColor" size={12} strokeWidth={1.8} />
        </Link>
      </div>
    </motion.div>
  )
}

export function LearningNotesPanel() {
  const { t } = useTranslation('learning')
  const notesQuery = useQuery({
    queryFn: () => window.desktop.learning.listNotesWithCards(),
    queryKey: learningQueryKeys.notesWithCards,
    refetchOnMount: 'always',
  })
  const optimizersQuery = useQuery({
    queryFn: async () => (await window.desktop.learning.listOptimizers())
      .filter(optimizer => optimizer.status === 'active'),
    queryKey: learningQueryKeys.optimizerOptions,
    refetchOnMount: 'always',
  })

  if (notesQuery.isPending || optimizersQuery.isPending) {
    return (
      <div {...stylex.props(styles.status)} role="status">
        <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={16} />
        <span>{t('loadingNotes')}</span>
      </div>
    )
  }

  if (notesQuery.isError || optimizersQuery.isError) {
    return (
      <div {...stylex.props(styles.status)} role="alert">
        <span>{t('loadNotesFailed')}</span>
        <button
          {...stylex.props(styles.retryButton)}
          type="button"
          onClick={() => void Promise.all([notesQuery.refetch(), optimizersQuery.refetch()])}
        >
          {t('retry')}
        </button>
      </div>
    )
  }

  const notes = notesQuery.data
  const optimizers = optimizersQuery.data
  for (const note of notes) {
    if (!optimizers.some(optimizer => optimizer.id === note.optimizer.id))
      throw new Error(`Note ${note.noteId} has unavailable FSRS Optimizer ${note.optimizer.id}`)
  }
  return (
    <div {...stylex.props(styles.workspace)}>
      <div {...stylex.props(styles.scroll)}>
        <div {...stylex.props(styles.content)}>
          <header {...stylex.props(styles.header)}>
            <div {...stylex.props(styles.heading)}>
              <h2 {...stylex.props(styles.title)}>{t('notes')}</h2>
              <p {...stylex.props(styles.summary)}>{t('learningNoteCount', { count: notes.length })}</p>
            </div>
          </header>
          {notes.length > 0
            ? (
                <div {...stylex.props(styles.list)} role="list">
                  {notes.map((note, index) => (
                    <LearningNoteRow key={note.noteId} index={index} note={note} optimizers={optimizers} />
                  ))}
                </div>
              )
            : <div {...stylex.props(styles.empty)}>{t('noLearningNotes')}</div>}
        </div>
      </div>
    </div>
  )
}
