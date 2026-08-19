import type { NoteSummary } from '@memorilo/editor-storage'
import type { MobileRuntime } from '@/application/mobile-runtime'
import type { EditorDomHostHandle } from '@/surfaces/editor-dom-host'
import type { EditorSurfaceStructure } from '@/surfaces/editor-surface-contract'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { localJournalDate } from '@/application/journal-date'
import { useMobileLanguage } from '@/application/mobile-language-hook'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { NoteStructureSheet } from '@/features/notes/note-structure-sheet'
import { EditorDomHost } from '@/surfaces/editor-dom-host'
import { ActionButton } from '@/ui/action-button'
import { EmptyState } from '@/ui/empty-state'
import { GlassHeader } from '@/ui/glass-header'
import { IconButton } from '@/ui/icon-button'
import { GlassSurface } from '@/ui/liquid-glass'
import { TextField } from '@/ui/text-field'
import { colors } from '@/ui/theme'

const iconSize = 21

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function nextUntitledTitle(notes: readonly NoteSummary[]): string {
  const titles = new Set(notes.map(note => note.title.toLocaleLowerCase()))
  if (!titles.has('untitled'))
    return 'Untitled'
  for (let index = 2; index < 10_000; index++) {
    const title = `Untitled ${index}`
    if (!titles.has(title.toLocaleLowerCase()))
      return title
  }
  throw new Error('Unable to allocate a unique Note title')
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 28,
  },
  editorCanvas: {
    backgroundColor: colors.background,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  editorHeader: {
    left: 0,
    marginTop: 4,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 2,
  },
  editorScreen: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  errorOverlay: {
    left: 16,
    position: 'absolute',
    right: 16,
    top: 136,
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 420,
    textAlign: 'center',
  },
  list: {
    flexGrow: 1,
    paddingBottom: 112,
    paddingHorizontal: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  modalBody: {
    gap: 16,
    maxWidth: 460,
    padding: 20,
    width: '100%',
  },
  modalError: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  modalRoot: {
    alignItems: 'center',
    backgroundColor: colors.scrim,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
  },
  noteMetadata: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  noteRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 12,
  },
  noteRowPressed: {
    backgroundColor: colors.surfacePressed,
  },
  noteText: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
  },
  noteTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  search: {
    color: colors.text,
    fontSize: 15,
  },
  searchShell: {
    marginBottom: 16,
    marginTop: 14,
  },
})

function NotesWorkspace({
  requestedNoteId,
  requestedTopicId,
  runtime,
}: {
  requestedNoteId: string | null
  requestedTopicId: string | null
  runtime: MobileRuntime
}) {
  const { language } = useMobileLanguage()
  const { t } = useTranslation('pages')
  const navigation = useNavigation()
  const editorRef = useRef<EditorDomHostHandle>(null)
  const [notes, setNotes] = useState<readonly NoteSummary[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(requestedNoteId)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [editorReady, setEditorReady] = useState(false)
  const [renameVisible, setRenameVisible] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [structure, setStructure] = useState<EditorSurfaceStructure | null>(null)
  const [structureVisible, setStructureVisible] = useState(false)
  const requestedTopicOpened = useRef<string | null>(null)

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedNoteId === null ? undefined : { display: 'none' },
    })
    return () => {
      navigation.setOptions({ tabBarStyle: undefined })
    }
  }, [navigation, selectedNoteId])

  const loadNotes = useCallback(async () => {
    const page = await runtime.editor.notes.listNotes({
      pageSize: 100,
      sortBy: 'updatedAt',
      sortDirection: 'desc',
      today: localJournalDate(),
    })
    setNotes(page.items.filter(note => note.journalDate === undefined))
  }, [runtime])

  useEffect(() => {
    let active = true
    void loadNotes().then(
      () => {
        if (active)
          setLoading(false)
      },
      (failure: unknown) => {
        if (active) {
          setError(toError(failure))
          setLoading(false)
        }
      },
    )
    return () => {
      active = false
    }
  }, [loadNotes])

  useEffect(() => {
    if (!editorReady || requestedTopicId === null || selectedNoteId !== requestedNoteId || !editorRef.current)
      return
    const key = `${selectedNoteId}:${requestedTopicId}`
    if (requestedTopicOpened.current === key)
      return
    requestedTopicOpened.current = key
    void editorRef.current.openTopic(requestedTopicId).then(setStructure).catch((failure: unknown) => setError(toError(failure)))
  }, [editorReady, requestedNoteId, requestedTopicId, selectedNoteId])

  const selectedNote = notes.find(note => note.id === selectedNoteId) ?? null
  const visibleNotes = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized.length === 0
      ? notes
      : notes.filter(note => note.title.toLocaleLowerCase().includes(normalized))
  }, [notes, query])

  const openNote = useCallback(async (noteId: string) => {
    setBusy(true)
    setError(null)
    try {
      await editorRef.current?.flush()
      setEditorReady(false)
      setStructure(null)
      setSelectedNoteId(noteId)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setBusy(false)
    }
  }, [])

  const createNote = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await editorRef.current?.flush()
      setEditorReady(false)
      const created = await runtime.editor.notes.createNote({ title: nextUntitledTitle(notes) })
      await loadNotes()
      setSelectedNoteId(created.id)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setBusy(false)
    }
  }, [loadNotes, notes, runtime])

  const closeEditor = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await editorRef.current?.flush()
      await loadNotes()
      setEditorReady(false)
      setStructure(null)
      setStructureVisible(false)
      setSelectedNoteId(null)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setBusy(false)
    }
  }, [loadNotes])

  const openStructure = useCallback(async () => {
    const editor = editorRef.current
    if (!editor)
      return
    setBusy(true)
    setError(null)
    try {
      const nextStructure = await editor.refreshStructure()
      setStructure(nextStructure)
      setStructureVisible(true)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setBusy(false)
    }
  }, [])

  const toggleFavorite = useCallback(async (note: NoteSummary) => {
    setError(null)
    try {
      const result = await runtime.editor.notes.setNoteFavorite({
        favorite: !note.favorite,
        noteId: note.id,
      })
      setNotes(current => current.map(candidate => candidate.id === note.id
        ? { ...candidate, favorite: result.favorite }
        : candidate))
    }
    catch (failure) {
      setError(toError(failure))
    }
  }, [runtime])

  const showRename = useCallback(() => {
    if (!selectedNote)
      return
    setRenameTitle(selectedNote.title)
    setRenameError(null)
    setRenameVisible(true)
  }, [selectedNote])

  const submitRename = useCallback(async () => {
    const title = renameTitle.trim()
    if (title.length === 0) {
      setRenameError(t('mobileNoteTitleEmpty'))
      return
    }
    setBusy(true)
    setRenameError(null)
    try {
      await editorRef.current?.renameNote(title)
      setNotes(current => current.map(note => note.id === selectedNoteId ? { ...note, title } : note))
      setRenameVisible(false)
    }
    catch (failure) {
      setRenameError(toError(failure).message)
    }
    finally {
      setBusy(false)
    }
  }, [renameTitle, selectedNoteId, t])

  if (selectedNoteId !== null) {
    const title = selectedNote?.title ?? t('mobileNotesTitle')
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.editorScreen}>
          <View style={styles.editorCanvas}>
            <EditorDomHost
              key={selectedNoteId}
              ref={editorRef}
              kind="note"
              noteId={selectedNoteId}
              runtime={runtime}
              immersive
              onReady={() => setEditorReady(true)}
              onStructureChanged={setStructure}
              onTitleChanged={(nextTitle) => {
                setNotes(current => current.map(note => note.id === selectedNoteId
                  ? { ...note, title: nextTitle }
                  : note))
              }}
            />
          </View>
          <GlassHeader
            leading={(
              <IconButton
                accessibilityLabel={t('mobileBackToNotes')}
                disabled={busy}
                onPress={() => void closeEditor()}
              >
                <Ionicons color={colors.text} name="chevron-back" size={iconSize} />
              </IconButton>
            )}
            style={styles.editorHeader}
            title={title}
            trailing={(
              <>
                <IconButton
                  accessibilityLabel={t('mobileNoteStructure')}
                  disabled={busy || !editorReady}
                  onPress={() => void openStructure()}
                >
                  <Ionicons color={colors.text} name="list-outline" size={iconSize} />
                </IconButton>
                <IconButton
                  accessibilityLabel={selectedNote?.favorite ? t('mobileRemoveFavorite') : t('mobileAddFavorite')}
                  disabled={busy || !selectedNote}
                  onPress={() => selectedNote && void toggleFavorite(selectedNote)}
                >
                  <Ionicons
                    color={selectedNote?.favorite ? colors.accent : colors.muted}
                    name={selectedNote?.favorite ? 'star' : 'star-outline'}
                    size={iconSize}
                  />
                </IconButton>
                <IconButton
                  accessibilityLabel={t('mobileRenameNote')}
                  disabled={busy || !editorReady || !selectedNote}
                  onPress={showRename}
                >
                  <Ionicons color={colors.text} name="pencil-outline" size={iconSize} />
                </IconButton>
              </>
            )}
          />
          {error ? <Text selectable style={[styles.error, styles.errorOverlay]}>{error.message}</Text> : null}
        </View>
        <NoteStructureSheet
          structure={structure}
          visible={structureVisible}
          onClose={() => setStructureVisible(false)}
          onCreateEntry={async (input) => {
            const editor = editorRef.current
            if (!editor)
              throw new Error('Editor is unavailable')
            const next = await editor.createEntry(input)
            setStructure(next)
            return next
          }}
          onDeleteEntry={async (input) => {
            const editor = editorRef.current
            if (!editor)
              throw new Error('Editor is unavailable')
            const next = await editor.deleteEntry(input)
            setStructure(next)
            return next
          }}
          onMoveEntry={async (input) => {
            const editor = editorRef.current
            if (!editor)
              throw new Error('Editor is unavailable')
            const next = await editor.moveEntry(input)
            setStructure(next)
            return next
          }}
          onOpenTopic={async (topicId) => {
            const editor = editorRef.current
            if (!editor)
              throw new Error('Editor is unavailable')
            const next = await editor.openTopic(topicId)
            setStructure(next)
            return next
          }}
          onRenameEntry={async (entryId, label) => {
            const editor = editorRef.current
            if (!editor)
              throw new Error('Editor is unavailable')
            const next = await editor.renameEntry(entryId, label)
            setStructure(next)
            return next
          }}
        />
        <Modal animationType="fade" transparent visible={renameVisible} onRequestClose={() => setRenameVisible(false)}>
          <View style={styles.modalRoot}>
            <GlassSurface style={styles.modalBody}>
              <Text style={styles.modalTitle}>{t('mobileRenameNote')}</Text>
              <TextInput
                autoFocus
                maxLength={200}
                returnKeyType="done"
                selectTextOnFocus
                style={styles.modalInput}
                value={renameTitle}
                onChangeText={setRenameTitle}
                onSubmitEditing={() => void submitRename()}
              />
              {renameError ? <Text selectable style={styles.modalError}>{renameError}</Text> : null}
              <View style={styles.modalActions}>
                <ActionButton
                  disabled={busy}
                  label={t('mobileCancel')}
                  onPress={() => setRenameVisible(false)}
                />
                <ActionButton
                  disabled={busy}
                  label={t('mobileRename')}
                  tone="primary"
                  onPress={() => void submitRename()}
                />
              </View>
            </GlassSurface>
          </View>
        </Modal>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root}>
      <GlassHeader
        subtitle={t('mobileLocalNote', { count: notes.length })}
        title={t('mobileNotesTitle')}
        trailing={(
          <IconButton
            accessibilityLabel={t('mobileCreateNote')}
            disabled={busy}
            onPress={() => void createNote()}
          >
            {busy
              ? <ActivityIndicator color={colors.accent} />
              : <Ionicons color={colors.accent} name="add" size={25} />}
          </IconButton>
        )}
      />
      <TextField
        accessibilityLabel={t('mobileSearchNotes')}
        clearButtonMode="while-editing"
        containerStyle={styles.searchShell}
        leading={<Ionicons color={colors.muted} name="search-outline" size={19} />}
        placeholder={t('mobileSearchNotes')}
        returnKeyType="search"
        style={styles.search}
        value={query}
        onChangeText={setQuery}
      />
      {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
      {loading
        ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.accent} />
            </View>
          )
        : (
            <FlatList
              contentContainerStyle={styles.list}
              data={visibleNotes}
              keyExtractor={note => note.id}
              ListEmptyComponent={(
                <View style={styles.centered}>
                  <EmptyState
                    description={query ? t('mobileTryAnotherTitle') : t('mobileCreateNoteDescription')}
                    icon={<Ionicons color={colors.accent} name="document-text-outline" size={28} />}
                    title={query ? t('mobileNoMatchingNotes') : t('mobileNoNotesYet')}
                  />
                </View>
              )}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityLabel={t('mobileOpenNote', { title: item.title })}
                  style={({ pressed }) => [styles.noteRow, pressed && styles.noteRowPressed]}
                  onPress={() => void openNote(item.id)}
                >
                  <View style={styles.noteText}>
                    <Text numberOfLines={1} style={styles.noteTitle}>{item.title}</Text>
                    <Text style={styles.noteMetadata}>
                      {new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' }).format(item.updatedAt)}
                    </Text>
                  </View>
                  <IconButton
                    accessibilityLabel={item.favorite ? t('mobileRemoveFavorite') : t('mobileAddFavorite')}
                    onPress={(event) => {
                      event.stopPropagation()
                      void toggleFavorite(item)
                    }}
                  >
                    <Ionicons
                      color={item.favorite ? colors.accent : colors.muted}
                      name={item.favorite ? 'star' : 'star-outline'}
                      size={19}
                    />
                  </IconButton>
                </Pressable>
              )}
            />
          )}
    </SafeAreaView>
  )
}

export function NotesScreen() {
  const { t } = useTranslation('pages')
  const params = useLocalSearchParams<{ noteId?: string, topicId?: string }>()
  const requestedNoteId = typeof params.noteId === 'string' ? params.noteId : null
  const requestedTopicId = typeof params.topicId === 'string' ? params.topicId : null
  const runtimeState = useMobileRuntimeState()
  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.emptyDescription}>{t('mobileOpeningDatabase')}</Text>
      </SafeAreaView>
    )
  }
  if (runtimeState.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.emptyTitle}>{t('mobileStartupFailed')}</Text>
        <Text selectable style={styles.error}>{runtimeState.error.message}</Text>
      </SafeAreaView>
    )
  }
  return (
    <NotesWorkspace
      key={requestedNoteId ?? 'notes'}
      requestedNoteId={requestedNoteId}
      requestedTopicId={requestedTopicId}
      runtime={runtimeState.runtime}
    />
  )
}
