import type {
  EditorAdapters,
  EditorImageOcclusionIntegration,
  EditorImageOcclusionTopicDocument,
  EditorNote,
  EditorOpenedTopic,
  EditorTopicDocument,
  OpenImageOcclusionInput,
} from '@memorilo/editor'
import type { PaletteCommand } from '../../../shared/command-palette'
import type { EditorNoteSessionOpened, TopicValidationError } from './note-editor-session'
import { Editor, EditorMode, useEditorTopicMode } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  AlignLeft,
  Copy,
  ListTree,
  PanelRight,
  Star,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommandPaletteCommands } from '../../../shared/command-palette'
import { useDesktopConfiguration } from '../../../shared/configuration'
import { usePageTitlebar } from '../../../shared/page-titlebar'
import { desktopEditorAdapters } from './note-editor-session'
import { noteEditorStyles } from './note-editor.stylex'
import { useNoteEntryContextMenu } from './note-entry-context-menu'
import { NoteInspector } from './note-inspector'

const ImageOcclusionTopicEditor = lazy(async () => {
  const module = await import('./image-occlusion-editor')
  return { default: module.ImageOcclusionEditor }
})

const noteInspectorVisibleAtom = atomWithStorage(
  'memorilo.note-inspector-visible.v1',
  false,
  undefined,
  { getOnInit: true },
)

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

function DocumentTopicEditor({
  focusBlockId,
  imageOcclusion,
  topic,
}: {
  focusBlockId?: string
  imageOcclusion?: EditorImageOcclusionIntegration
  topic: EditorTopicDocument
}) {
  const { t } = useTranslation('editor')
  const configuration = useDesktopConfiguration()
  const adapters = useMemo<EditorAdapters>(
    () => desktopEditorAdapters(configuration.networkImagePasteBehavior),
    [configuration.networkImagePasteBehavior],
  )
  const mode = useEditorTopicMode(topic)
  const showDocumentMode = useCallback(() => topic.setMode(EditorMode.Document), [topic])
  const showOutlineMode = useCallback(() => topic.setMode(EditorMode.Outline), [topic])
  const modeCommands = useMemo<readonly PaletteCommand[]>(() => mode === EditorMode.Document
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
      }], [mode, showDocumentMode, showOutlineMode, t])
  useCommandPaletteCommands(modeCommands)

  return (
    <Editor
      adapters={adapters}
      focus={focusBlockId === undefined ? undefined : { blockId: focusBlockId }}
      imageOcclusion={imageOcclusion}
      outline={{ outdentBehavior: configuration.outdentBehavior }}
      topic={topic}
    />
  )
}

export interface NoteEditorViewProps {
  collapsedEntryIds: ReadonlySet<string>
  favoritePending: boolean
  focusBlockId?: string
  onAddBook: (parentId: string | null) => void
  onAddFolder: (parentId: string | null) => void
  onAddTopic: (parentId: string | null) => void
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
  const [inspectorVisible, setInspectorVisible] = useAtom(noteInspectorVisibleAtom)
  const currentEntry = opened.entries.find(entry => entry.id === opened.topic.topicId)
  if (!currentEntry || currentEntry.kind !== 'topic')
    throw new Error(`Note ${opened.note.id} does not contain open Topic ${opened.topic.topicId}`)
  const imageOcclusionTopic = isImageOcclusionTopic(opened.topic) ? opened.topic : null
  if ((currentEntry.topicType === 'image-occlusion') !== (imageOcclusionTopic !== null))
    throw new Error(`Topic ${currentEntry.id} document does not match type ${currentEntry.topicType}`)
  const regularTopicImageOcclusion = useMemo<EditorImageOcclusionIntegration | undefined>(() => {
    if (currentEntry.topicType !== 'regular')
      return undefined
    const sourceTopicId = opened.topic.topicId
    return {
      getState: (imageId) => {
        const topic = opened.note.findImageOcclusionTopic(sourceTopicId, imageId)
        return topic ? topic.getState() : null
      },
      open: onOpenImageOcclusion,
      subscribe: listener => opened.topic.subscribe(listener),
    }
  }, [currentEntry.topicType, onOpenImageOcclusion, opened.note, opened.topic])
  const toggleInspector = useCallback(() => setInspectorVisible(visible => !visible), [setInspectorVisible])
  const entryContextMenu = useNoteEntryContextMenu({
    onAddBook,
    onAddFolder,
    onAddTopic,
    onRebindBook,
  })
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
    onRenameTitle: renameNote,
    title: opened.stored.title,
    trailing: (
      <>
        <button
          {...stylex.props(
            noteEditorStyles.titlebarActionButton,
            opened.stored.favorite && noteEditorStyles.titlebarFavoriteActive,
          )}
          aria-label={opened.stored.favorite ? t('removeFromFavorites') : t('addToFavorites')}
          aria-pressed={opened.stored.favorite}
          disabled={favoritePending}
          title={opened.stored.favorite ? t('removeFromFavorites') : t('addToFavorites')}
          type="button"
          onClick={onToggleFavorite}
        >
          <Star
            aria-hidden="true"
            fill={opened.stored.favorite ? 'currentColor' : 'none'}
            size={16}
            strokeWidth={1.8}
          />
        </button>
        <button
          {...stylex.props(noteEditorStyles.titlebarActionButton)}
          aria-label={inspectorVisible ? t('hideNoteInspector') : t('showNoteInspector')}
          title={inspectorVisible ? t('hideNoteInspector') : t('showNoteInspector')}
          type="button"
          onClick={toggleInspector}
        >
          <PanelRight aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
      </>
    ),
  }), [
    favoritePending,
    inspectorVisible,
    onToggleFavorite,
    opened.stored.favorite,
    opened.stored.title,
    renameNote,
    t,
    toggleInspector,
  ])
  usePageTitlebar(titlebar)

  return (
    <main {...stylex.props(noteEditorStyles.page)}>
      <section {...stylex.props(noteEditorStyles.workspace)} aria-label={opened.stored.title}>
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
        {isImageOcclusionTopic(opened.topic)
          ? (
              <Suspense fallback={<div {...stylex.props(noteEditorStyles.topicLoading)} role="status">{t('loadingEditor')}</div>}>
                <ImageOcclusionTopicEditor
                  onRename={renameImageOcclusionTopic}
                  title={currentEntry.title}
                  topic={opened.topic}
                />
              </Suspense>
            )
          : (
              <DocumentTopicEditor
                focusBlockId={focusBlockId}
                imageOcclusion={regularTopicImageOcclusion}
                topic={opened.topic}
              />
            )}
      </section>
      <NoteInspector
        collapsedEntryIds={collapsedEntryIds}
        currentTopicId={opened.topic.topicId}
        entries={opened.entries}
        noteId={opened.note.id}
        onOpenBookContextMenu={entryContextMenu.openBook}
        onOpenContainerContextMenu={entryContextMenu.openContainer}
        onToggleEntry={onToggleEntry}
        open={inspectorVisible}
      />
      {entryContextMenu.menu}
    </main>
  )
}
