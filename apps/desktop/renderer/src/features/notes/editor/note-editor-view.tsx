import type {
  EditorImageOcclusionIntegration,
  EditorImageOcclusionTopicDocument,
  EditorNote,
  EditorOpenedTopic,
  OpenImageOcclusionInput,
} from '@memorilo/editor'
import type { PaletteCommand } from '../../../shared/command-palette'
import type { EditorNoteSessionOpened, TopicValidationError } from './note-editor-session'
import { Editor, EditorMode, useEditorTopicMode } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { AlignLeft, Copy, ListTree } from 'lucide-react'
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
import { SpreadsheetEditor } from './spreadsheet-editor'
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

export interface NoteEditorViewProps {
  collapsedEntryIds: ReadonlySet<string>
  favoritePending: boolean
  focusBlockId?: string
  onAddBook: (parentId: string | null) => void
  onAddFolder: (parentId: string | null) => void
  onAddSpreadsheet: (parentId: string | null) => void
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
  onAddSpreadsheet,
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
  const spreadsheetTopic = 'getWorkbook' in opened.topic ? opened.topic : null
  const whiteboardTopic = 'getScene' in opened.topic ? opened.topic : null
  if ((currentEntry.topicType === 'image-occlusion') !== (imageOcclusionTopic !== null))
    throw new Error(`Topic ${currentEntry.id} document does not match type ${currentEntry.topicType}`)
  if ((currentEntry.topicType === 'whiteboard') !== (whiteboardTopic !== null))
    throw new Error(`Topic ${currentEntry.id} document does not match type ${currentEntry.topicType}`)
  if ((currentEntry.topicType === 'spreadsheet') !== (spreadsheetTopic !== null))
    throw new Error(`Topic ${currentEntry.id} document does not match type ${currentEntry.topicType}`)

  const mode = useEditorTopicMode(editorTopic)
  const toggleInspector = useCallback(() => setInspectorVisible(visible => !visible), [setInspectorVisible])
  const entryContextMenu = useNoteEntryContextMenu({
    onAddBook,
    onAddFolder,
    onAddSpreadsheet,
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
        const topic = opened.note.findImageOcclusionTopic(sourceTopicId, imageId)
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
    ...(whiteboardTopic === null && spreadsheetTopic === null ? { onRenameTitle: renameNote } : {}),
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
    titleVisibility: whiteboardTopic === null && spreadsheetTopic === null ? 'always' as const : 'hidden' as const,
  }), [
    favoritePending,
    inspectorVisible,
    onToggleFavorite,
    opened.stored.favorite,
    opened.stored.title,
    renameNote,
    spreadsheetTopic,
    toggleInspector,
    whiteboardTopic,
  ])
  usePageTitlebar(titlebar)

  return (
    <main {...stylex.props(noteEditorStyles.page)}>
      <section
        {...stylex.props(
          noteEditorStyles.workspace,
          (whiteboardTopic !== null || spreadsheetTopic !== null) && noteEditorStyles.fullBleedWorkspace,
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
          : spreadsheetTopic !== null
            ? (
                <SpreadsheetEditor
                  key={spreadsheetTopic.topicId}
                  title={currentEntry.title}
                  topic={spreadsheetTopic}
                />
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
