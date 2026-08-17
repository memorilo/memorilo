import type {
  DesktopJournalNote,
  DesktopJournalSummary,
  JournalDate,
} from '@memorilo/desktop-api'
import type { EditorNote, EditorTopicDocument } from '@memorilo/editor'
import type { EditorNoteSessionCache } from '../notes/note-runtime'
import { JournalEditor, resolveJournalTopic } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useDesktopConfiguration } from '../../shared/configuration'
import { desktopRequests } from '../../shared/desktop-requests'
import {
  desktopEditorAdapters,
  useEditorNoteSession,
} from '../notes/editor/note-editor-session'
import { formatJournalHeading } from './journal-model'
import { journalsPageStyles as journalRouteStyles } from './journals-page.stylex'

interface JournalDayProps {
  cache: EditorNoteSessionCache
  first: boolean
  onJournalSaved: () => void
  summary: DesktopJournalSummary
  today: JournalDate
}

function resolveStoredJournalTopic(
  note: EditorNote,
  stored: DesktopJournalNote,
): EditorTopicDocument {
  const topic = resolveJournalTopic(note, { expectedNoteTitle: stored.journalDate })
  if (topic.topicId !== stored.topicId) {
    throw new Error(
      `Journal ${stored.journalDate} expected Topic ${stored.topicId}, but contains ${topic.topicId}`,
    )
  }
  return topic
}

export function JournalDay({
  cache,
  first,
  onJournalSaved,
  summary,
  today,
}: JournalDayProps) {
  const { t } = useTranslation(['app', 'editor'])
  const configuration = useDesktopConfiguration()
  const loadNote = useCallback(async () => {
    const note = await desktopRequests.openJournal({ journalDate: summary.journalDate })
    if (note.id !== summary.noteId)
      throw new Error(`Journal ${summary.journalDate} changed its Note identity`)
    if (note.topicId !== summary.topicId)
      throw new Error(`Journal ${summary.journalDate} changed its Topic identity`)
    return note
  }, [summary.journalDate, summary.noteId, summary.topicId])
  const session = useEditorNoteSession<DesktopJournalNote>({
    cache,
    loadNote,
    noteId: summary.noteId,
    onSaved: onJournalSaved,
    resolveTopic: resolveStoredJournalTopic,
    topicKey: summary.topicId,
  })
  const adapters = useMemo(
    () => desktopEditorAdapters(configuration.networkImagePasteBehavior),
    [configuration.networkImagePasteBehavior],
  )

  let editorContent
  if (session.loadError) {
    editorContent = (
      <div {...stylex.props(journalRouteStyles.inlineStatus, journalRouteStyles.inlineError)} role="alert">
        <TriangleAlert {...stylex.props(journalRouteStyles.statusIcon)} aria-hidden="true" strokeWidth={1.7} />
        <span>{t('couldNotOpenJournal', { date: formatJournalHeading(summary.journalDate), message: session.loadError })}</span>
      </div>
    )
  }
  else if (!session.opened) {
    editorContent = (
      <div {...stylex.props(journalRouteStyles.inlineStatus)} role="status">
        <LoaderCircle
          {...stylex.props(journalRouteStyles.statusIcon, journalRouteStyles.loadingIcon)}
          aria-hidden="true"
          strokeWidth={1.7}
        />
        <span>{t('openingJournal')}</span>
      </div>
    )
  }
  else {
    editorContent = (
      <>
        {session.validationError
          ? (
              <div {...stylex.props(journalRouteStyles.validationError)} role="alert">
                {session.validationError.message}
              </div>
            )
          : null}
        {session.saveError
          ? (
              <div {...stylex.props(journalRouteStyles.validationError)} role="status">
                {t('failedToSaveNote', { message: session.saveError, ns: 'editor' })}
              </div>
            )
          : null}
        <JournalEditor
          adapters={adapters}
          note={session.opened.note}
          outline={{ outdentBehavior: configuration.outdentBehavior }}
          taskDate={summary.journalDate}
        />
      </>
    )
  }

  return (
    <article
      {...stylex.props(journalRouteStyles.day, first && journalRouteStyles.firstDay)}
      aria-labelledby={`journal-heading-${summary.journalDate}`}
    >
      <header {...stylex.props(journalRouteStyles.dayHeader)}>
        <h2 id={`journal-heading-${summary.journalDate}`} {...stylex.props(journalRouteStyles.dayTitle)}>
          <time dateTime={summary.journalDate}>{formatJournalHeading(summary.journalDate)}</time>
          {summary.journalDate === today
            ? <span {...stylex.props(journalRouteStyles.todayLabel)}>{t('today')}</span>
            : null}
        </h2>
      </header>
      <div {...stylex.props(journalRouteStyles.editorRegion)}>{editorContent}</div>
    </article>
  )
}
