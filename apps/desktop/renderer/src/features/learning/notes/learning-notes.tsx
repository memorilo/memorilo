import type { DesktopAnkiDeck, DesktopLearningApi } from '@memorilo/desktop-preload'
import type { ChangeEvent } from 'react'
import type { AnkiDeckTreeNode } from './anki-deck-tree'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, FileText, LoaderCircle, Play, SlidersHorizontal, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDesktopConfiguration } from '../../../shared/configuration'
import { desktopEffect, desktopEffectQuery } from '../../../shared/effect-query'
import * as LearningActivity from '../components/learning-activity'
import { learningQueryKeys } from '../query-keys'
import { buildAnkiDeckTree } from './anki-deck-tree'
import { learningNotesStyles as styles } from './learning-notes.stylex'

type LearningNote = Awaited<ReturnType<DesktopLearningApi['listNotesWithCards']>>[number]
type LearningOptimizer = Awaited<ReturnType<DesktopLearningApi['listOptimizers']>>[number]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function useAnkiConnectionRevision(
  connection: { apiKey: string, enabled: boolean, host: string, port: number },
): number {
  const state = useRef({ ...connection, revision: 0 })
  if (
    state.current.apiKey !== connection.apiKey
    || state.current.enabled !== connection.enabled
    || state.current.host !== connection.host
    || state.current.port !== connection.port
  ) {
    state.current = { ...connection, revision: state.current.revision + 1 }
  }
  return state.current.revision
}

function AnkiDeckNode({
  collapsed,
  depth,
  node,
  onToggle,
}: {
  collapsed: ReadonlySet<string>
  depth: number
  node: AnkiDeckTreeNode
  onToggle: (path: string) => void
}) {
  const { t } = useTranslation('learning')
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.path)
  const leadingStyle = { paddingLeft: 8 + depth * 20 }

  return (
    <div {...stylex.props(styles.deckTreeItem)} aria-expanded={hasChildren ? !isCollapsed : undefined} role="treeitem">
      <div {...stylex.props(styles.deckRow)}>
        <div {...stylex.props(styles.deckLeading)} style={leadingStyle}>
          <span {...stylex.props(styles.deckIcon)}>
            <Sparkles aria-hidden="true" size={17} strokeWidth={1.9} />
          </span>
          <span {...stylex.props(styles.identity)}>
            <span {...stylex.props(styles.deckTitleLine)}>
              <span {...stylex.props(styles.noteTitle)}>{node.label}</span>
              {hasChildren
                ? (
                    <button
                      {...stylex.props(styles.disclosureButton)}
                      aria-label={t(isCollapsed ? 'expandAnkiDeck' : 'collapseAnkiDeck', { deck: node.label })}
                      type="button"
                      onClick={() => onToggle(node.path)}
                    >
                      {isCollapsed
                        ? <ChevronRight aria-hidden="true" size={13} strokeWidth={2} />
                        : <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />}
                    </button>
                  )
                : null}
            </span>
          </span>
        </div>
        {node.deck
          ? <AnkiDeckStudyButton deck={node.deck} />
          : null}
      </div>
      {hasChildren && !isCollapsed
        ? (
            <div role="group">
              {node.children.map(child => (
                <AnkiDeckNode
                  key={child.path}
                  collapsed={collapsed}
                  depth={depth + 1}
                  node={child}
                  onToggle={onToggle}
                />
              ))}
            </div>
          )
        : null}
    </div>
  )
}

function AnkiDeckStudyButton({ deck }: { deck: DesktopAnkiDeck }) {
  const { t } = useTranslation('learning')
  return (
    <Link
      {...stylex.props(styles.studyButton)}
      aria-label={t('startAnkiDeckReview', { deck: deck.name })}
      search={{ deckId: deck.id, deckName: deck.name }}
      title={t('startAnkiDeckReview', { deck: deck.name })}
      to="/learning/anki-review"
    >
      <Play aria-hidden="true" fill="currentColor" size={12} strokeWidth={1.8} />
    </Link>
  )
}

function AnkiDeckRows({ decks, showEmpty }: { decks: readonly DesktopAnkiDeck[], showEmpty: boolean }) {
  const { i18n, t } = useTranslation('learning')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const projection = useMemo((): { error: unknown, status: 'error' } | { status: 'ready', tree: readonly AnkiDeckTreeNode[] } => {
    try {
      const collator = new Intl.Collator(i18n.language, { numeric: true, sensitivity: 'base' })
      return { status: 'ready', tree: buildAnkiDeckTree(decks, collator.compare) }
    }
    catch (error) {
      return { error, status: 'error' }
    }
  }, [decks, i18n.language])
  const toggle = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path))
        next.delete(path)
      else
        next.add(path)
      return next
    })
  }

  if (projection.status === 'error') {
    return (
      <div role="listitem">
        <div {...stylex.props(styles.inlineStatus)} role="alert">
          <span>
            {t('loadAnkiDecksFailed')}
            {': '}
            {errorMessage(projection.error)}
          </span>
        </div>
      </div>
    )
  }

  if (projection.tree.length === 0) {
    return showEmpty
      ? (
          <div role="listitem">
            <div {...stylex.props(styles.inlineStatus)}>{t('noAnkiDecks')}</div>
          </div>
        )
      : null
  }

  return (
    <div role="listitem">
      <div aria-label={t('ankiDecks')} role="tree">
        {projection.tree.map(node => (
          <AnkiDeckNode key={node.path} collapsed={collapsed} depth={0} node={node} onToggle={toggle} />
        ))}
      </div>
    </div>
  )
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
  const assignment = useMutation(desktopEffectQuery.mutationOptions({
    mutationFn: (optimizer: LearningOptimizer) => desktopEffect('learning.assign-note-optimizer', () => (
      window.desktop.learning.assignNoteOptimizer({
        noteId: note.noteId,
        optimizerId: optimizer.id,
      })
    )),
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
  }))

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
  const configuration = useDesktopConfiguration()
  const notesQuery = useQuery(desktopEffectQuery.queryOptions({
    queryFn: () => desktopEffect('learning.list-notes-with-cards', () => (
      window.desktop.learning.listNotesWithCards()
    )),
    queryKey: learningQueryKeys.notesWithCards,
    refetchOnMount: 'always',
  }))
  const optimizersQuery = useQuery(desktopEffectQuery.queryOptions({
    queryFn: () => desktopEffect('learning.list-active-optimizers', async () => (
      (await window.desktop.learning.listOptimizers())
        .filter(optimizer => optimizer.status === 'active')
    )),
    queryKey: learningQueryKeys.optimizerOptions,
    refetchOnMount: 'always',
  }))
  const ankiRevision = useAnkiConnectionRevision(configuration.anki)
  const ankiDecksQuery = useQuery(desktopEffectQuery.queryOptions({
    enabled: configuration.anki.enabled,
    queryFn: () => desktopEffect('learning.list-anki-decks', () => window.desktop.learning.listAnkiDecks()),
    queryKey: learningQueryKeys.ankiDecks(ankiRevision),
    refetchOnMount: 'always',
    staleTime: 30_000,
  }))

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
          <LearningActivity.Root />
          {notes.length > 0 || configuration.anki.enabled
            ? (
                <div {...stylex.props(styles.list)} role="list">
                  {notes.map((note, index) => (
                    <LearningNoteRow key={note.noteId} index={index} note={note} optimizers={optimizers} />
                  ))}
                  {configuration.anki.enabled
                    ? ankiDecksQuery.isPending
                      ? (
                          <div role="listitem">
                            <div {...stylex.props(styles.inlineStatus)} role="status">
                              <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={15} />
                              <span>{t('loadingAnkiDecks')}</span>
                            </div>
                          </div>
                        )
                      : ankiDecksQuery.isError
                        ? (
                            <div role="listitem">
                              <div {...stylex.props(styles.inlineStatus)} role="alert">
                                <span>{t('loadAnkiDecksFailed')}</span>
                                <button
                                  {...stylex.props(styles.retryButton)}
                                  type="button"
                                  onClick={() => void ankiDecksQuery.refetch()}
                                >
                                  {t('retry')}
                                </button>
                              </div>
                            </div>
                          )
                        : <AnkiDeckRows decks={ankiDecksQuery.data} showEmpty={notes.length === 0} />
                    : null}
                </div>
              )
            : <div {...stylex.props(styles.empty)}>{t('noLearningNotes')}</div>}
        </div>
      </div>
    </div>
  )
}
