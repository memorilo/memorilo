import type { NoteSummary } from '@memorilo/editor-storage'
import type { MobileRuntime } from '@/application/mobile-runtime'
import type { EditorDomHostHandle } from '@/surfaces/editor-dom-host'
import { Ionicons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { EditorDomHost } from '@/surfaces/editor-dom-host'
import { GlassHeader } from '@/ui/glass-header'
import { GlassSurface, LiquidGlassInput } from '@/ui/liquid-glass'
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
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  actionButtonPressed: {
    backgroundColor: colors.accentSoft,
    transform: [{ scale: 0.95 }],
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 28,
  },
  editor: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    height: 58,
    justifyContent: 'center',
    marginBottom: 4,
    width: 58,
  },
  emptySurface: {
    alignItems: 'center',
    gap: 10,
    maxWidth: 360,
    paddingHorizontal: 28,
    paddingVertical: 30,
    width: '100%',
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
  modalAction: {
    alignItems: 'center',
    borderRadius: 7,
    minHeight: 42,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  modalActionPrimary: {
    backgroundColor: colors.accent,
  },
  modalActionSecondary: {
    backgroundColor: colors.accentSoft,
  },
  modalActionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  modalActionTextPrimary: {
    color: '#FFFFFF',
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
    borderColor: colors.border,
    borderRadius: 7,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  modalRoot: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 26, 24, 0.34)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.44)',
    borderColor: colors.glassBorder,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: 10,
    minHeight: 68,
    paddingHorizontal: 12,
  },
  noteRowPressed: {
    backgroundColor: colors.accentSoft,
    transform: [{ scale: 0.985 }],
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

function NotesWorkspace({ runtime }: { runtime: MobileRuntime }) {
  const editorRef = useRef<EditorDomHostHandle>(null)
  const [notes, setNotes] = useState<readonly NoteSummary[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [renameVisible, setRenameVisible] = useState(false)
  const [renameTitle, setRenameTitle] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)

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
      setSelectedNoteId(null)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setBusy(false)
    }
  }, [loadNotes])

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
      setRenameError('A Note title cannot be empty.')
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
  }, [renameTitle, selectedNoteId])

  if (selectedNoteId !== null) {
    const title = selectedNote?.title ?? 'Note'
    return (
      <SafeAreaView style={styles.root}>
        <GlassHeader
          leading={(
            <Pressable
              accessibilityLabel="Back to Notes"
              disabled={busy}
              hitSlop={8}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={() => void closeEditor()}
            >
              <Ionicons color={colors.text} name="chevron-back" size={iconSize} />
            </Pressable>
          )}
          title={title}
          trailing={(
            <>
              <Pressable
                accessibilityLabel={selectedNote?.favorite ? 'Remove from favorites' : 'Add to favorites'}
                disabled={busy || !selectedNote}
                hitSlop={8}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                onPress={() => selectedNote && void toggleFavorite(selectedNote)}
              >
                <Ionicons
                  color={selectedNote?.favorite ? colors.accent : colors.muted}
                  name={selectedNote?.favorite ? 'star' : 'star-outline'}
                  size={iconSize}
                />
              </Pressable>
              <Pressable
                accessibilityLabel="Rename Note"
                disabled={busy || !selectedNote}
                hitSlop={8}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                onPress={showRename}
              >
                <Ionicons color={colors.text} name="pencil-outline" size={iconSize} />
              </Pressable>
            </>
          )}
        />
        {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
        <View style={styles.editor}>
          <EditorDomHost
            key={selectedNoteId}
            ref={editorRef}
            kind="note"
            noteId={selectedNoteId}
            runtime={runtime}
            onTitleChanged={(nextTitle) => {
              setNotes(current => current.map(note => note.id === selectedNoteId
                ? { ...note, title: nextTitle }
                : note))
            }}
          />
        </View>
        <Modal animationType="fade" transparent visible={renameVisible} onRequestClose={() => setRenameVisible(false)}>
          <View style={styles.modalRoot}>
            <GlassSurface style={styles.modalBody}>
              <Text style={styles.modalTitle}>Rename Note</Text>
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
                <Pressable
                  disabled={busy}
                  style={[styles.modalAction, styles.modalActionSecondary]}
                  onPress={() => setRenameVisible(false)}
                >
                  <Text style={styles.modalActionText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={busy}
                  style={[styles.modalAction, styles.modalActionPrimary]}
                  onPress={() => void submitRename()}
                >
                  <Text style={[styles.modalActionText, styles.modalActionTextPrimary]}>Rename</Text>
                </Pressable>
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
        subtitle={notes.length === 1 ? '1 local note' : `${notes.length} local notes`}
        title="Notes"
        trailing={(
          <Pressable
            accessibilityLabel="Create Note"
            disabled={busy}
            hitSlop={8}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={() => void createNote()}
          >
            {busy
              ? <ActivityIndicator color={colors.accent} />
              : <Ionicons color={colors.accent} name="add" size={25} />}
          </Pressable>
        )}
      />
      <LiquidGlassInput
        accessibilityLabel="Search Notes"
        clearButtonMode="while-editing"
        containerStyle={styles.searchShell}
        placeholder="Search Notes"
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
                  <GlassSurface style={styles.emptySurface}>
                    <View style={styles.emptyIcon}>
                      <Ionicons color={colors.accent} name="document-text-outline" size={28} />
                    </View>
                    <Text style={styles.emptyTitle}>{query ? 'No matching Notes' : 'No Notes yet'}</Text>
                    <Text style={styles.emptyDescription}>
                      {query ? 'Try another title.' : 'Create a Note to start writing.'}
                    </Text>
                  </GlassSurface>
                </View>
              )}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityLabel={`Open ${item.title}`}
                  style={({ pressed }) => [styles.noteRow, pressed && styles.noteRowPressed]}
                  onPress={() => void openNote(item.id)}
                >
                  <View style={styles.noteText}>
                    <Text numberOfLines={1} style={styles.noteTitle}>{item.title}</Text>
                    <Text style={styles.noteMetadata}>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(item.updatedAt)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    hitSlop={8}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
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
                  </Pressable>
                </Pressable>
              )}
            />
          )}
    </SafeAreaView>
  )
}

export function NotesScreen() {
  const runtimeState = useMobileRuntimeState()
  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.emptyDescription}>Opening local database</Text>
      </SafeAreaView>
    )
  }
  if (runtimeState.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.emptyTitle}>Startup failed</Text>
        <Text selectable style={styles.error}>{runtimeState.error.message}</Text>
      </SafeAreaView>
    )
  }
  return <NotesWorkspace runtime={runtimeState.runtime} />
}
