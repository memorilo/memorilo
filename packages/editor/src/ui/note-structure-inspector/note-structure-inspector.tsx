import type { EditorNote, NoteEntrySnapshot, TopicSnapshot } from '../../note/editor-note'
import * as stylex from '@stylexjs/stylex'
import {
  BookOpen,
  Brackets,
  ChevronRight,
  CreditCard,
  FileText,
  Folder,
  FolderOpen,
  Highlighter,
  ListChecks,
  ListOrdered,
  PenLine,
  ScanLine,
  Table2,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { projectVisibleNoteEntries } from '../../note/note-entry-tree'
import { noteStructureInspectorStyles as styles } from './note-structure-inspector.stylex'

export interface NoteStructureInspectorProps {
  collapsedEntryIds: ReadonlySet<string>
  currentTopicId: string
  entries: readonly NoteEntrySnapshot[]
  learningEnabled?: boolean
  note?: Pick<EditorNote, 'getLearningEnabled' | 'setLearningEnabled'>
  onOpenTopic: (topicId: string) => void
  onToggleEntry: (entryId: string) => void
  showTitle?: boolean
}

function TopicIcon({ entry }: { entry: TopicSnapshot }) {
  const Icon = entry.topicType === 'book'
    ? BookOpen
    : entry.topicType === 'image-occlusion'
      ? ScanLine
      : entry.topicType === 'spreadsheet'
        ? Table2
        : entry.topicType === 'whiteboard'
          ? PenLine
          : entry.cardSource?.kind === 'cloze'
            ? Brackets
            : entry.cardSource?.kind === 'highlight'
              ? Highlighter
              : entry.cardSource?.kind === 'list'
                ? ListOrdered
                : entry.cardSource?.kind === 'set'
                  ? ListChecks
                  : entry.cardSource === undefined
                    ? FileText
                    : CreditCard
  return <Icon {...stylex.props(styles.entryIcon)} aria-hidden="true" size={14} strokeWidth={1.7} />
}

export function NoteStructureInspector({
  collapsedEntryIds,
  currentTopicId,
  entries,
  learningEnabled = true,
  note,
  onOpenTopic,
  onToggleEntry,
  showTitle = true,
}: NoteStructureInspectorProps) {
  const { t } = useTranslation('editor')
  const visibleEntries = useMemo(
    () => projectVisibleNoteEntries(entries, collapsedEntryIds)
      .filter(({ entry }) => learningEnabled || entry.kind !== 'topic' || entry.topicType !== 'image-occlusion'),
    [collapsedEntryIds, entries, learningEnabled],
  )
  const topicCount = useMemo(
    () => entries.reduce(
      (count, entry) => count + (entry.kind === 'topic' && (learningEnabled || entry.topicType !== 'image-occlusion') ? 1 : 0),
      0,
    ),
    [entries, learningEnabled],
  )
  const noteLearningEnabled = note?.getLearningEnabled()

  return (
    <section {...stylex.props(styles.root)} aria-label={t('noteStructure')}>
      {showTitle
        ? (
            <header {...stylex.props(styles.header)}>
              <h2 {...stylex.props(styles.title)}>{t('noteStructure')}</h2>
              <span {...stylex.props(styles.titleCount)}>{topicCount}</span>
            </header>
          )
        : null}
      {note !== undefined && noteLearningEnabled !== undefined
        ? (
            <div {...stylex.props(styles.learningRow)}>
              <span {...stylex.props(styles.learningLabel)}>{t('learningEnabled')}</span>
              <button
                {...stylex.props(styles.learningSwitch, noteLearningEnabled && styles.learningSwitchOn)}
                aria-checked={noteLearningEnabled}
                aria-label={t('toggleLearning')}
                role="switch"
                title={t('toggleLearning')}
                type="button"
                onClick={() => note.setLearningEnabled(!noteLearningEnabled)}
              >
                <span {...stylex.props(styles.learningSwitchThumb, noteLearningEnabled && styles.learningSwitchThumbOn)} />
              </button>
            </div>
          )
        : null}
      <div {...stylex.props(styles.content)} role="list">
        {visibleEntries.length === 0
          ? <div {...stylex.props(styles.empty)}>{t('noteStructureEmpty')}</div>
          : visibleEntries.map(({ depth, entry, hasChildren }) => {
              const collapsed = collapsedEntryIds.has(entry.id)
              const label = entry.kind === 'folder' ? entry.name : entry.title || t('untitledTopic')
              const current = entry.kind === 'topic' && entry.id === currentTopicId
              return (
                <div key={entry.id} {...stylex.props(styles.entryRow(depth))} role="listitem">
                  {entry.kind === 'folder'
                    ? (
                        <button
                          {...stylex.props(styles.entryButton)}
                          aria-expanded={hasChildren ? !collapsed : undefined}
                          disabled={!hasChildren}
                          title={label}
                          type="button"
                          onClick={() => onToggleEntry(entry.id)}
                        >
                          <ChevronRight
                            {...stylex.props(styles.disclosureIcon, hasChildren && !collapsed && styles.disclosureIconExpanded)}
                            aria-hidden="true"
                            size={12}
                            strokeWidth={1.9}
                          />
                          {hasChildren && !collapsed
                            ? <FolderOpen {...stylex.props(styles.entryIcon)} aria-hidden="true" size={15} strokeWidth={1.7} />
                            : <Folder {...stylex.props(styles.entryIcon)} aria-hidden="true" size={15} strokeWidth={1.7} />}
                          <span {...stylex.props(styles.entryLabel)}>{label}</span>
                        </button>
                      )
                    : (
                        <>
                          {hasChildren
                            ? (
                                <button
                                  {...stylex.props(styles.disclosureButton)}
                                  aria-expanded={!collapsed}
                                  aria-label={t('collapsedExpand', { action: collapsed ? t('expand') : t('collapse'), label })}
                                  type="button"
                                  onClick={() => onToggleEntry(entry.id)}
                                >
                                  <ChevronRight
                                    {...stylex.props(styles.disclosureIcon, !collapsed && styles.disclosureIconExpanded)}
                                    aria-hidden="true"
                                    size={12}
                                    strokeWidth={1.9}
                                  />
                                </button>
                              )
                            : <span {...stylex.props(styles.disclosurePlaceholder)} />}
                          <button
                            {...stylex.props(styles.entryButton, current && styles.entryButtonCurrent)}
                            aria-current={current ? 'page' : undefined}
                            title={label}
                            type="button"
                            onClick={() => onOpenTopic(entry.id)}
                          >
                            <TopicIcon entry={entry} />
                            <span {...stylex.props(styles.entryLabel)}>{label}</span>
                          </button>
                        </>
                      )}
                </div>
              )
            })}
      </div>
    </section>
  )
}
