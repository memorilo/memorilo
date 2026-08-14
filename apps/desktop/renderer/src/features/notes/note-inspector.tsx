import type { BookTopicSnapshot, NoteEntrySnapshot } from '@memorilo/editor'
import type { MouseEvent as ReactMouseEvent } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Link } from '@tanstack/react-router'
import { BookOpen, ChevronRight, FileText, Folder, FolderOpen, PenLine, ScanLine } from 'lucide-react'
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

export function NoteInspector({
  collapsedEntryIds,
  contextMenu,
  currentTopicId,
  entries,
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
  noteId: string
  onToggleEntry: (entryId: string) => void
  showTitle?: boolean
}) {
  const { t } = useTranslation('editor')
  const shouldReduceMotion = useReducedMotion()
  const visibleEntries = useMemo(
    () => projectVisibleNoteEntries(entries, collapsedEntryIds),
    [collapsedEntryIds, entries],
  )
  const topicCount = useMemo(
    () => entries.reduce((count, entry) => count + (entry.kind === 'topic' ? 1 : 0), 0),
    [entries],
  )
  const entryTransition = shouldReduceMotion ? { duration: 0.12 } : entrySpring

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
      <div {...stylex.props(noteInspectorStyles.inspectorContent)}>
        <section {...stylex.props(noteInspectorStyles.inspectorSection)} aria-label={t('noteStructure')}>
          <div {...stylex.props(noteInspectorStyles.topicTree)} role="list">
            <AnimatePresence initial={false}>
              {visibleEntries.map(({ depth, entry, hasChildren }) => {
                const collapsed = collapsedEntryIds.has(entry.id)
                const label = entry.kind === 'folder' ? entry.name : entry.title || t('untitledTopic')
                const current = entry.kind === 'topic' && entry.id === currentTopicId
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
                            {entry.topicType === 'book'
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
