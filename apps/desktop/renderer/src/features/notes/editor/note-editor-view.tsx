import type {
  EditorImageOcclusionIntegration,
  EditorImageOcclusionTopicDocument,
  EditorNote,
  EditorOpenedTopic,
  OpenImageOcclusionInput,
  TopicReaderSource,
} from '@memorilo/editor'
import type { PaletteCommand } from '../../../shared/command-palette'
import type { EditorNoteSessionOpened, TopicValidationError } from './note-editor-session'
import { Editor, EditorMode, useEditorTopicMode } from '@memorilo/editor'
import { readerAnnotationLabel } from '@memorilo/editor/reader'
import * as stylex from '@stylexjs/stylex'
import { Link } from '@tanstack/react-router'
import { AlignLeft, Copy, ListTree, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommandPaletteCommands } from '../../../shared/command-palette'
import { useDesktopConfiguration } from '../../../shared/configuration'
import { usePageTitlebar } from '../../../shared/page-titlebar'
import { NoteInspector } from '../note-inspector'
import { NoteInspectorActions } from '../note-inspector-actions'
import { useNoteInspectorVisibility } from '../note-inspector-state'
import { desktopEditorAdapters } from './note-editor-session'
import { noteEditorStyles } from './note-editor.stylex'
import { useNoteEntryContextMenu } from './note-entry-context-menu'
import { WhiteboardEditor } from './whiteboard-editor'

const ImageOcclusionTopicEditor = lazy(async () => {
  const module = await import('./image-occlusion-editor')
  return { default: module.ImageOcclusionEditor }
})

type CopyStatus = 'copied' | 'failed'

interface CopyFeedback {
  diagnostics: string
  status: CopyStatus
}

function isImageOcclusionTopic(
  topic: EditorOpenedTopic,
): topic is EditorImageOcclusionTopicDocument {
  return 'getState' in topic
}

interface ReaderSourceNavigation {
  annotationId: string
  bookTopicId: string
  readingId: string
}

function ReaderSourceHeader({
  navigation,
  noteId,
  onRemove,
  source,
}: {
  navigation: ReaderSourceNavigation | null
  noteId: string
  onRemove?: () => void
  source: TopicReaderSource
}) {
  const { t } = useTranslation('editor')
  const content = (
    <>
      {source.kind === 'text'
        ? <blockquote {...stylex.props(noteEditorStyles.readerSourceText)}>{source.text}</blockquote>
        : (
            <img
              {...stylex.props(noteEditorStyles.readerSourceImage)}
              alt={source.location}
              src={source.imageSrc}
            />
          )}
      <span {...stylex.props(noteEditorStyles.readerSourceLocation)}>{source.location}</span>
    </>
  )

  return (
    <div {...stylex.props(noteEditorStyles.readerSourceHeader)}>
      {navigation === null
        ? <div {...stylex.props(noteEditorStyles.readerSourceSnapshot)}>{content}</div>
        : (
            <Link
              {...stylex.props(noteEditorStyles.readerSourceLink)}
              aria-label={t('openReaderSource')}
              params={{ readingId: navigation.readingId }}
              search={{
                annotationId: navigation.annotationId,
                noteId,
                topicId: navigation.bookTopicId,
              }}
              title={t('openReaderSource')}
              to="/reader/$readingId"
            >
              {content}
            </Link>
          )}
      {onRemove
        ? (
            <button
              {...stylex.props(noteEditorStyles.readerSourceRemove)}
              aria-label={t('removeReaderSource')}
              title={t('removeReaderSource')}
              type="button"
              onClick={onRemove}
            >
              <X aria-hidden="true" size={16} strokeWidth={1.9} />
            </button>
          )
        : null}
    </div>
  )
}

export interface NoteEditorViewProps {
  collapsedEntryIds: ReadonlySet<string>
  favoritePending: boolean
  focusBlockId?: string
  onAddBook: (parentId: string | null) => void
  onAddFolder: (parentId: string | null) => void
  onAddTopic: (parentId: string | null) => void
  onAddWhiteboard: (parentId: string | null) => void
  onOpenImageOcclusion: (input: OpenImageOcclusionInput) => Promise<void> | void
  onRebindBook: (topicId: string) => void
  onRenameNote: (note: EditorNote, title: string) => Promise<{ error?: string } | void>
  onToggleEntry: (entryId: string) => void
  onToggleFavorite: () => void
  opened: EditorNoteSessionOpened
  saveError: string | null
  validationError: TopicValidationError | null
}

export function NoteEditorView({
  collapsedEntryIds,
  favoritePending,
  focusBlockId,
  onAddBook,
  onAddFolder,
  onAddTopic,
  onAddWhiteboard,
  onOpenImageOcclusion,
  onRebindBook,
  onRenameNote,
  onToggleEntry,
  onToggleFavorite,
  opened,
  saveError,
  validationError,
}: NoteEditorViewProps) {
  const { t } = useTranslation('editor')
  const { t: tCommon } = useTranslation('common')
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null)
  const [inspectorVisible, setInspectorVisible] = useNoteInspectorVisibility()
  const configuration = useDesktopConfiguration()
  const editorAdapters = useMemo(
    () => desktopEditorAdapters(configuration.networkImagePasteBehavior),
    [configuration.networkImagePasteBehavior],
  )
  const currentEntry = opened.entries.find(entry => entry.id === opened.topic.topicId)
  if (!currentEntry || currentEntry.kind !== 'topic')
    throw new Error(`Note ${opened.note.id} does not contain open Topic ${opened.topic.topicId}`)

  const imageOcclusionTopic = isImageOcclusionTopic(opened.topic) ? opened.topic : null
  const editorTopic = 'documentId' in opened.topic ? opened.topic : null
  const whiteboardTopic = 'getScene' in opened.topic ? opened.topic : null
  if ((currentEntry.topicType === 'image-occlusion') !== (imageOcclusionTopic !== null))
    throw new Error(`Topic ${currentEntry.id} document does not match type ${currentEntry.topicType}`)
  if ((currentEntry.topicType === 'whiteboard') !== (whiteboardTopic !== null))
    throw new Error(`Topic ${currentEntry.id} document does not match type ${currentEntry.topicType}`)

  const mode = useEditorTopicMode(editorTopic)
  const readerReference = currentEntry.topicType === 'regular'
    ? currentEntry.readerReference ?? null
    : null
  const sourceBookTopic = readerReference?.annotationId === undefined
    ? null
    : opened.entries.find(entry => entry.kind === 'topic'
      && entry.topicType === 'book'
      && entry.id === readerReference.bookTopicId) ?? null
  const sourceReadingId = sourceBookTopic?.kind === 'topic' && sourceBookTopic.topicType === 'book'
    ? sourceBookTopic.book.retrievalHints[0]?.readingId
    : undefined
  const readerSourceNavigation = readerReference?.annotationId !== undefined && sourceReadingId !== undefined
    ? {
        annotationId: readerReference.annotationId,
        bookTopicId: readerReference.bookTopicId,
        readingId: sourceReadingId,
      }
    : null
  const imageOcclusionState = imageOcclusionTopic?.getState() ?? null
  const imageOcclusionReaderSource = imageOcclusionState?.source.kind === 'reader-region'
    ? imageOcclusionState.source
    : null
  const imageOcclusionSourceBookTopic = imageOcclusionReaderSource === null
    ? null
    : opened.entries.find(entry => entry.kind === 'topic'
      && entry.topicType === 'book'
      && entry.id === imageOcclusionReaderSource.topicId) ?? null
  const imageOcclusionSourceAnnotation = imageOcclusionReaderSource === null
    || imageOcclusionSourceBookTopic?.kind !== 'topic'
    || imageOcclusionSourceBookTopic.topicType !== 'book'
    ? null
    : opened.note.getBookTopic(imageOcclusionSourceBookTopic.id).getReadingState().annotations.find(
      annotation => annotation.id === imageOcclusionReaderSource.annotationId,
    ) ?? null
  const imageOcclusionSourceReadingId = imageOcclusionSourceAnnotation === null
    || imageOcclusionSourceBookTopic?.kind !== 'topic'
    || imageOcclusionSourceBookTopic.topicType !== 'book'
    ? undefined
    : imageOcclusionSourceBookTopic.book.retrievalHints[0]?.readingId
  const imageOcclusionSource = imageOcclusionState === null || imageOcclusionReaderSource === null
    ? null
    : {
        imageSrc: imageOcclusionState.image.src,
        kind: 'region' as const,
        location: imageOcclusionSourceAnnotation === null
          ? t('imageOcclusion.readerRegionSource')
          : readerAnnotationLabel(imageOcclusionSourceAnnotation, tCommon),
      }
  const imageOcclusionSourceNavigation = imageOcclusionSourceAnnotation === null
    || imageOcclusionSourceReadingId === undefined
    || imageOcclusionReaderSource === null
    ? null
    : {
        annotationId: imageOcclusionSourceAnnotation.id,
        bookTopicId: imageOcclusionReaderSource.topicId,
        readingId: imageOcclusionSourceReadingId,
      }
  const toggleInspector = useCallback(() => setInspectorVisible(visible => !visible), [setInspectorVisible])
  const entryContextMenu = useNoteEntryContextMenu({
    onAddBook,
    onAddFolder,
    onAddTopic,
    onAddWhiteboard,
    onRebindBook,
  })
  const showDocumentMode = useCallback(() => editorTopic?.setMode(EditorMode.Document), [editorTopic])
  const showOutlineMode = useCallback(() => editorTopic?.setMode(EditorMode.Outline), [editorTopic])
  const modeCommands = useMemo<readonly PaletteCommand[]>(() => editorTopic === null
    ? []
    : mode === EditorMode.Document
      ? [{
          accent: 'violet',
          action: t('switchMode'),
          description: t('switchToOutlineDescription'),
          icon: ListTree,
          id: 'editor-mode-outline',
          keywords: t('switchToOutlineKeywords') as unknown as readonly string[],
          label: t('switchToOutlineMode'),
          run: showOutlineMode,
          section: t('editorSection') as PaletteCommand['section'],
        }]
      : [{
          accent: 'blue',
          action: t('switchMode'),
          description: t('switchToDocumentDescription'),
          icon: AlignLeft,
          id: 'editor-mode-document',
          keywords: t('switchToDocumentKeywords') as unknown as readonly string[],
          label: t('switchToDocumentMode'),
          run: showDocumentMode,
          section: t('editorSection') as PaletteCommand['section'],
        }], [editorTopic, mode, showDocumentMode, showOutlineMode, t])
  useCommandPaletteCommands(modeCommands)

  const regularTopicImageOcclusion = useMemo<EditorImageOcclusionIntegration | undefined>(() => {
    if (currentEntry.topicType !== 'regular' || editorTopic === null)
      return undefined
    const sourceTopicId = editorTopic.topicId
    return {
      getState: (imageId) => {
        const topic = opened.note.findImageOcclusionTopic({
          imageId,
          kind: 'topic-image',
          topicId: sourceTopicId,
        })
        return topic ? topic.getState() : null
      },
      open: onOpenImageOcclusion,
      subscribe: editorTopic.subscribe,
    }
  }, [currentEntry.topicType, editorTopic, onOpenImageOcclusion, opened.note])
  const renameNote = useCallback((title: string) => onRenameNote(opened.note, title), [onRenameNote, opened.note])
  const renameImageOcclusionTopic = useCallback(
    (title: string) => opened.note.renameEntry(opened.topic.topicId, title),
    [opened.note, opened.topic.topicId],
  )
  const copyValidationDiagnostics = useCallback(async () => {
    if (!validationError)
      return
    try {
      if (typeof navigator.clipboard?.writeText !== 'function')
        throw new Error('The Clipboard API is unavailable')
      await navigator.clipboard.writeText(validationError.diagnostics)
      setCopyFeedback({ diagnostics: validationError.diagnostics, status: 'copied' })
    }
    catch (error) {
      console.error('Failed to copy Topic validation diagnostics', error)
      setCopyFeedback({ diagnostics: validationError.diagnostics, status: 'failed' })
    }
  }, [validationError])
  const copyStatus = copyFeedback !== null && copyFeedback.diagnostics === validationError?.diagnostics
    ? copyFeedback.status
    : null
  const titlebar = useMemo(() => ({
    ...(whiteboardTopic === null ? { onRenameTitle: renameNote } : {}),
    sidebarAction: (
      <NoteInspectorActions
        favorite={opened.stored.favorite}
        favoritePending={favoritePending}
        inspectorVisible={inspectorVisible}
        onToggleFavorite={onToggleFavorite}
        onToggleInspector={toggleInspector}
      />
    ),
    title: opened.stored.title,
    titleVisibility: whiteboardTopic === null ? 'always' as const : 'hidden' as const,
  }), [
    favoritePending,
    inspectorVisible,
    onToggleFavorite,
    opened.stored.favorite,
    opened.stored.title,
    renameNote,
    toggleInspector,
    whiteboardTopic,
  ])
  usePageTitlebar(titlebar)

  return (
    <main {...stylex.props(noteEditorStyles.page)}>
      <section
        {...stylex.props(
          noteEditorStyles.workspace,
          whiteboardTopic !== null && noteEditorStyles.whiteboardWorkspace,
        )}
        aria-label={opened.stored.title}
      >
        {saveError || validationError
          ? (
              <div {...stylex.props(noteEditorStyles.alertStack)}>
                {validationError
                  ? (
                      <div {...stylex.props(noteEditorStyles.validationError)}>
                        <span {...stylex.props(noteEditorStyles.validationErrorMessage)} aria-live="assertive" role="alert">
                          {validationError.message}
                        </span>
                        <div {...stylex.props(noteEditorStyles.validationErrorActions)}>
                          <button
                            {...stylex.props(noteEditorStyles.copyDiagnosticsButton)}
                            aria-label={t('copyDiagnosticsLabel')}
                            title={t('copyDiagnosticsLabel')}
                            type="button"
                            onClick={copyValidationDiagnostics}
                          >
                            <Copy aria-hidden="true" size={14} strokeWidth={1.9} />
                            <span>{t('copyDiagnostics')}</span>
                          </button>
                          <span {...stylex.props(noteEditorStyles.copyDiagnosticsStatus)} aria-live="polite" role="status">
                            {copyStatus === 'copied' ? t('copied', { ns: 'common' }) : copyStatus === 'failed' ? t('copyFailed', { ns: 'common' }) : ''}
                          </span>
                        </div>
                      </div>
                    )
                  : null}
                {saveError
                  ? (
                      <div {...stylex.props(noteEditorStyles.saveError)} aria-live="polite" role="status">
                        {t('failedToSaveNote', { message: saveError })}
                      </div>
                    )
                  : null}
              </div>
            )
          : null}
        {readerReference
          ? (
              <ReaderSourceHeader
                navigation={readerSourceNavigation}
                noteId={opened.note.id}
                source={readerReference.source}
                onRemove={() => opened.note.setTopicReaderReference(opened.topic.topicId, null)}
              />
            )
          : imageOcclusionSource === null
            ? null
            : (
                <ReaderSourceHeader
                  navigation={imageOcclusionSourceNavigation}
                  noteId={opened.note.id}
                  source={imageOcclusionSource}
                />
              )}
        {imageOcclusionTopic !== null
          ? (
              <Suspense fallback={<div {...stylex.props(noteEditorStyles.topicLoading)} role="status">{t('loadingEditor')}</div>}>
                <ImageOcclusionTopicEditor
                  onRename={renameImageOcclusionTopic}
                  title={currentEntry.title}
                  topic={imageOcclusionTopic}
                />
              </Suspense>
            )
          : editorTopic !== null
            ? (
                <Editor
                  adapters={editorAdapters}
                  focus={focusBlockId === undefined ? undefined : { blockId: focusBlockId }}
                  imageOcclusion={regularTopicImageOcclusion}
                  outline={{ outdentBehavior: configuration.outdentBehavior }}
                  topic={editorTopic}
                />
              )
            : whiteboardTopic !== null
              ? (
                  <WhiteboardEditor
                    adapters={editorAdapters}
                    inspectorVisible={inspectorVisible}
                    topic={whiteboardTopic}
                  />
                )
              : null}
      </section>
      <NoteInspector
        collapsedEntryIds={collapsedEntryIds}
        contextMenu={{
          onOpenBook: entryContextMenu.openBook,
          onOpenContainer: entryContextMenu.openContainer,
        }}
        currentTopicId={opened.topic.topicId}
        entries={opened.entries}
        noteId={opened.note.id}
        onToggleEntry={onToggleEntry}
        open={inspectorVisible}
      />
      {entryContextMenu.menu}
    </main>
  )
}
