import type { BookTopicSnapshot, CardTopicSource, EditorNote, NoteEntrySnapshot } from '@memorilo/editor'
import type { MouseEvent as ReactMouseEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Link } from '@tanstack/react-router'
import { BookOpen, Brackets, ChevronRight, CreditCard, FileText, Folder, FolderOpen, Highlighter, Link2, ListChecks, ListOrdered, PenLine, ScanLine, Table2, Unlink } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { projectVisibleNoteEntries } from './note-entry-tree'
import { noteInspectorStyles } from './note-inspector.stylex'

const inspectorSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.28,
} as const

const entrySpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.2,
} as const

function bookTopicReadingId(topic: BookTopicSnapshot): string {
  const hint = topic.book.retrievalHints[0]
  if (!hint)
    throw new Error(`BookTopic ${topic.id} is missing its reading locator`)
  return hint.readingId
}

function CardTopicIcon({
  source,
}: {
  source: CardTopicSource
}) {
  const Icon = source.kind === 'cloze'
    ? Brackets
    : source.kind === 'highlight'
      ? Highlighter
      : source.kind === 'list'
        ? ListOrdered
        : source.kind === 'set'
          ? ListChecks
          : CreditCard
  const SyncIcon = source.syncStatus === 'synced' ? Link2 : Unlink
  return (
    <span
      {...stylex.props(noteInspectorStyles.cardTopicIcon)}
      aria-hidden="true"
      data-card-topic-kind={source.kind}
      data-card-topic-sync={source.syncStatus}
    >
      <Icon {...stylex.props(noteInspectorStyles.topicIconGlyph)} size={14} strokeWidth={1.7} />
      <SyncIcon {...stylex.props(noteInspectorStyles.cardTopicSyncIcon)} size={8} strokeWidth={2.1} />
    </span>
  )
}

export function NoteInspector({
  collapsedEntryIds,
  contextMenu,
  currentTopicId,
  entries,
  learningEnabled = true,
  note,
  noteId,
  onToggleEntry,
  open,
}: {
  collapsedEntryIds: ReadonlySet<string>
  contextMenu?: {
    onOpenBook: (event: ReactMouseEvent, topicId: string, readingId: string) => void
    onOpenContainer: (event: ReactMouseEvent, parentId: string | null, allowFolder: boolean) => void
  }
  currentTopicId: string
  entries: readonly NoteEntrySnapshot[]
  learningEnabled?: boolean
  note: Pick<EditorNote, 'getLearningEnabled' | 'setLearningEnabled'>
  noteId: string
  onToggleEntry: (entryId: string) => void
  open: boolean
}) {
  const { t } = useTranslation('editor')
  const shouldReduceMotion = useReducedMotion()
  const inspectorInitial = shouldReduceMotion
    ? { opacity: 0 }
    : { opacity: 0, width: 0, x: 18 }
  const inspectorExit = inspectorInitial
  const inspectorAnimate = shouldReduceMotion
    ? { opacity: 1 }
    : { opacity: 1, width: 292, x: 0 }
  const inspectorTransition = shouldReduceMotion ? { duration: 0.12 } : inspectorSpring

  return (
    <AnimatePresence initial={false}>
      {open
        ? (
            <motion.aside
              {...stylex.props(noteInspectorStyles.inspector)}
              animate={inspectorAnimate}
              aria-label={t('noteInspector')}
              exit={inspectorExit}
              initial={inspectorInitial}
              transition={inspectorTransition}
            >
              <NoteInspectorContent
                collapsedEntryIds={collapsedEntryIds}
                contextMenu={contextMenu}
                currentTopicId={currentTopicId}
                entries={entries}
                learningEnabled={learningEnabled}
                note={note}
                noteId={noteId}
                onToggleEntry={onToggleEntry}
              />
            </motion.aside>
          )
        : null}
    </AnimatePresence>
  )
}

export function NoteInspectorContent({
  collapsedEntryIds,
  contextMenu,
  currentTopicId,
  entries,
  learningEnabled = true,
  note,
  noteId,
  onToggleEntry,
  showTitle = true,
}: {
  collapsedEntryIds: ReadonlySet<string>
  contextMenu?: {
    onOpenBook: (event: ReactMouseEvent, topicId: string, readingId: string) => void
    onOpenContainer: (event: ReactMouseEvent, parentId: string | null, allowFolder: boolean) => void
  }
  currentTopicId: string
  entries: readonly NoteEntrySnapshot[]
  learningEnabled?: boolean
  note: Pick<EditorNote, 'getLearningEnabled' | 'setLearningEnabled'>
  noteId: string
  onToggleEntry: (entryId: string) => void
  showTitle?: boolean
}) {
  const { t } = useTranslation('editor')
  const shouldReduceMotion = useReducedMotion()
  const visibleEntries = useMemo(
    () => projectVisibleNoteEntries(entries, collapsedEntryIds)
      .filter(({ entry }) => learningEnabled || entry.kind !== 'topic' || entry.topicType !== 'image-occlusion'),
    [collapsedEntryIds, entries, learningEnabled],
  )
  const topicCount = useMemo(
    () => entries.reduce((count, entry) => count + (entry.kind === 'topic' && (learningEnabled || entry.topicType !== 'image-occlusion') ? 1 : 0), 0),
    [entries, learningEnabled],
  )
  const entryTransition = shouldReduceMotion ? { duration: 0.12 } : entrySpring
  const noteLearningEnabled = note.getLearningEnabled()

  return (
    <>
      {showTitle
        ? (
            <header
              {...stylex.props(noteInspectorStyles.inspectorTitlebar)}
              onContextMenu={contextMenu === undefined
                ? undefined
                : event => contextMenu.onOpenContainer(event, null, true)}
            >
              <div {...stylex.props(noteInspectorStyles.inspectorTitleGroup)}>
                <h1 {...stylex.props(noteInspectorStyles.inspectorTitle)}>{t('noteStructure')}</h1>
                <span {...stylex.props(noteInspectorStyles.inspectorCount)}>{topicCount}</span>
              </div>
            </header>
          )
        : null}
      {learningEnabled
        ? (
            <div {...stylex.props(noteInspectorStyles.learningRow)}>
              <span {...stylex.props(noteInspectorStyles.learningLabel)}>{t('learningEnabled')}</span>
              <button
                {...stylex.props(
                  noteInspectorStyles.learningSwitch,
                  noteLearningEnabled && noteInspectorStyles.learningSwitchOn,
                )}
                aria-checked={noteLearningEnabled}
                aria-label={t('toggleLearning')}
                role="switch"
                title={t('toggleLearning')}
                type="button"
                onClick={() => note.setLearningEnabled(!noteLearningEnabled)}
              >
                <span
                  {...stylex.props(
                    noteInspectorStyles.learningSwitchThumb,
                    noteLearningEnabled && noteInspectorStyles.learningSwitchThumbOn,
                  )}
                />
              </button>
            </div>
          )
        : null}
      <div {...stylex.props(noteInspectorStyles.inspectorContent)}>
        <section {...stylex.props(noteInspectorStyles.inspectorSection)} aria-label={t('noteStructure')}>
          <div {...stylex.props(noteInspectorStyles.topicTree)} role="list">
            <AnimatePresence initial={false}>
              {visibleEntries.map(({ depth, entry, hasChildren }) => {
                const collapsed = collapsedEntryIds.has(entry.id)
                const label = entry.kind === 'folder' ? entry.name : entry.title || t('untitledTopic')
                const current = entry.kind === 'topic' && entry.id === currentTopicId
                const cardSource = entry.kind === 'topic' && entry.topicType === 'regular'
                  ? entry.cardSource
                  : undefined
                const topicContextMenu = contextMenu !== undefined && entry.kind === 'topic'
                  ? entry.topicType === 'book'
                    ? (event: ReactMouseEvent) => contextMenu.onOpenBook(
                        event,
                        entry.id,
                        bookTopicReadingId(entry),
                      )
                    : (event: ReactMouseEvent) => contextMenu.onOpenContainer(event, entry.id, false)
                  : undefined

                return (
                  <motion.div
                    key={entry.id}
                    {...stylex.props(
                      noteInspectorStyles.entryRow(depth),
                      current && noteInspectorStyles.entryRowCurrent,
                    )}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -3 }}
                    initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -3 }}
                    layout={shouldReduceMotion ? false : 'position'}
                    role="listitem"
                    transition={entryTransition}
                  >
                    {entry.kind === 'folder'
                      ? (
                          <button
                            {...stylex.props(noteInspectorStyles.folderEntryButton)}
                            aria-expanded={hasChildren ? !collapsed : undefined}
                            disabled={!hasChildren}
                            title={label}
                            type="button"
                            onClick={() => onToggleEntry(entry.id)}
                            onContextMenu={contextMenu === undefined
                              ? undefined
                              : event => contextMenu.onOpenContainer(event, entry.id, true)}
                          >
                            <motion.span
                              {...stylex.props(noteInspectorStyles.entryDisclosure)}
                              animate={{ rotate: hasChildren && !collapsed ? 90 : 0 }}
                              transition={entryTransition}
                            >
                              {hasChildren
                                ? <ChevronRight aria-hidden="true" size={12} strokeWidth={1.9} />
                                : null}
                            </motion.span>
                            {hasChildren && !collapsed
                              ? <FolderOpen {...stylex.props(noteInspectorStyles.folderIcon)} aria-hidden="true" size={15} strokeWidth={1.7} />
                              : <Folder {...stylex.props(noteInspectorStyles.folderIcon)} aria-hidden="true" size={15} strokeWidth={1.7} />}
                            <span {...stylex.props(noteInspectorStyles.entryLabel)}>{label}</span>
                          </button>
                        )
                      : (
                          <div {...stylex.props(noteInspectorStyles.topicEntry)} onContextMenu={topicContextMenu}>
                            {hasChildren
                              ? (
                                  <button
                                    {...stylex.props(noteInspectorStyles.entryDisclosureButton)}
                                    aria-label={t('collapsedExpand', { action: collapsed ? t('expand') : t('collapse'), label })}
                                    aria-expanded={!collapsed}
                                    type="button"
                                    onClick={() => onToggleEntry(entry.id)}
                                  >
                                    <motion.span
                                      {...stylex.props(noteInspectorStyles.entryDisclosure)}
                                      animate={{ rotate: collapsed ? 0 : 90 }}
                                      transition={entryTransition}
                                    >
                                      <ChevronRight aria-hidden="true" size={12} strokeWidth={1.9} />
                                    </motion.span>
                                  </button>
                                )
                              : <span {...stylex.props(noteInspectorStyles.entryDisclosurePlaceholder)} />}
                            {cardSource
                              ? <CardTopicIcon source={cardSource} />
                              : entry.topicType === 'book'
                                ? (
                                    <BookOpen
                                      {...stylex.props(
                                        noteInspectorStyles.topicIcon,
                                        current && noteInspectorStyles.topicIconCurrent,
                                      )}
                                      aria-hidden="true"
                                      size={14}
                                      strokeWidth={1.7}
                                    />
                                  )
                                : entry.topicType === 'image-occlusion'
                                  ? (
                                      <ScanLine
                                        {...stylex.props(
                                          noteInspectorStyles.topicIcon,
                                          current && noteInspectorStyles.topicIconCurrent,
                                        )}
                                        aria-hidden="true"
                                        size={14}
                                        strokeWidth={1.7}
                                      />
                                    )
                                  : entry.topicType === 'spreadsheet'
                                    ? (
                                        <Table2
                                          {...stylex.props(
                                            noteInspectorStyles.topicIcon,
                                            current && noteInspectorStyles.topicIconCurrent,
                                          )}
                                          aria-hidden="true"
                                          size={14}
                                          strokeWidth={1.7}
                                        />
                                      )
                                    : entry.topicType === 'whiteboard'
                                      ? (
                                          <PenLine
                                            {...stylex.props(
                                              noteInspectorStyles.topicIcon,
                                              current && noteInspectorStyles.topicIconCurrent,
                                            )}
                                            aria-hidden="true"
                                            size={14}
                                            strokeWidth={1.7}
                                          />
                                        )
                                      : (
                                          <FileText
                                            {...stylex.props(
                                              noteInspectorStyles.topicIcon,
                                              current && noteInspectorStyles.topicIconCurrent,
                                            )}
                                            aria-hidden="true"
                                            size={14}
                                            strokeWidth={1.7}
                                          />
                                        )}
                            {entry.topicType === 'book'
                              ? (
                                  <Link
                                    {...stylex.props(
                                      noteInspectorStyles.topicLink,
                                      current && noteInspectorStyles.topicLinkCurrent,
                                    )}
                                    aria-current={current ? 'page' : undefined}
                                    params={{ readingId: bookTopicReadingId(entry) }}
                                    preload="intent"
                                    search={{ noteId, topicId: entry.id }}
                                    title={label}
                                    to="/reader/$readingId"
                                  >
                                    <span {...stylex.props(noteInspectorStyles.entryLabel)}>{label}</span>
                                  </Link>
                                )
                              : (
                                  <Link
                                    {...stylex.props(
                                      noteInspectorStyles.topicLink,
                                      current && noteInspectorStyles.topicLinkCurrent,
                                    )}
                                    aria-current={current ? 'page' : undefined}
                                    params={{ noteId, topicId: entry.id }}
                                    preload="intent"
                                    search={{}}
                                    title={label}
                                    to="/note/$noteId/$topicId"
                                  >
                                    <span {...stylex.props(noteInspectorStyles.entryLabel)}>{label}</span>
                                  </Link>
                                )}
                          </div>
                        )}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </>
  )
}
