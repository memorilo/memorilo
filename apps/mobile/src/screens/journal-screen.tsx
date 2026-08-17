import type { StoredJournalSummary } from '@memorilo/editor-storage'
import type { MobileRuntime } from '@/application/mobile-runtime'
import type { EditorDomHostHandle } from '@/surfaces/editor-dom-host'
import { Ionicons } from '@expo/vector-icons'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { journalDateValue, localJournalDate, shiftJournalDate } from '@/application/journal-date'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { EditorDomHost } from '@/surfaces/editor-dom-host'
import { GlassHeader } from '@/ui/glass-header'
import { GlassSurface } from '@/ui/liquid-glass'
import { colors } from '@/ui/theme'

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
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
  actionButtonDisabled: {
    opacity: 0.32,
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
  dateLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  dateMetadata: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  editor: {
    backgroundColor: colors.surface,
    flex: 1,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  historyList: {
    flexGrow: 1,
    paddingBottom: 112,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  historyRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.44)',
    borderColor: colors.glassBorder,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  historyRowPressed: {
    backgroundColor: colors.accentSoft,
    transform: [{ scale: 0.985 }],
  },
  historyEmptySurface: {
    alignItems: 'center',
    maxWidth: 340,
    paddingHorizontal: 24,
    paddingVertical: 28,
    width: '100%',
  },
  historyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  todayButton: {
    alignSelf: 'center',
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  todayButtonPressed: {
    backgroundColor: colors.accentSoft,
  },
  todayButtonText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
})

function JournalWorkspace({ runtime }: { runtime: MobileRuntime }) {
  const today = useMemo(() => localJournalDate(), [])
  const editorRef = useRef<EditorDomHostHandle>(null)
  const [journalDate, setJournalDate] = useState(today)
  const [history, setHistory] = useState<readonly StoredJournalSummary[]>([])
  const [historyVisible, setHistoryVisible] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const displayDate = useMemo(() => new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(journalDateValue(journalDate)), [journalDate])

  const changeDate = useCallback(async (nextDate: string) => {
    if (nextDate > today)
      return
    setBusy(true)
    setError(null)
    try {
      await editorRef.current?.flush()
      setJournalDate(nextDate)
      setHistoryVisible(false)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setBusy(false)
    }
  }, [today])

  const showHistory = useCallback(async () => {
    setHistoryVisible(true)
    setHistoryLoading(true)
    setError(null)
    try {
      await editorRef.current?.flush()
      const page = await runtime.editor.journals.listPast({ limit: 100, today })
      setHistory(page.items)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setHistoryLoading(false)
    }
  }, [runtime, today])

  return (
    <SafeAreaView style={styles.root}>
      <GlassHeader
        leading={(
          <Pressable
            accessibilityLabel="Previous day"
            disabled={busy}
            hitSlop={8}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
            onPress={() => void changeDate(shiftJournalDate(journalDate, -1))}
          >
            <Ionicons color={colors.text} name="chevron-back" size={21} />
          </Pressable>
        )}
        subtitle={journalDate}
        title={displayDate}
        trailing={(
          <>
            <Pressable
              accessibilityLabel="Open Journal history"
              hitSlop={8}
              style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
              onPress={() => void showHistory()}
            >
              <Ionicons color={colors.text} name="calendar-outline" size={20} />
            </Pressable>
            {journalDate === today
              ? (
                  <Pressable
                    accessibilityLabel="Next day unavailable"
                    disabled
                    style={[styles.actionButton, styles.actionButtonDisabled]}
                  >
                    <Ionicons color={colors.muted} name="chevron-forward" size={21} />
                  </Pressable>
                )
              : (
                  <Pressable
                    accessibilityLabel="Next day"
                    disabled={busy}
                    hitSlop={8}
                    style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                    onPress={() => void changeDate(shiftJournalDate(journalDate, 1))}
                  >
                    <Ionicons color={colors.text} name="chevron-forward" size={21} />
                  </Pressable>
                )}
          </>
        )}
      />
      {journalDate !== today
        ? (
            <Pressable
              accessibilityLabel="Go to today's Journal"
              disabled={busy}
              style={({ pressed }) => [styles.todayButton, pressed && styles.todayButtonPressed]}
              onPress={() => void changeDate(today)}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>
          )
        : null}
      {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
      <View style={styles.editor}>
        <EditorDomHost
          key={journalDate}
          ref={editorRef}
          journalDate={journalDate}
          kind="journal"
          runtime={runtime}
        />
      </View>
      <Modal animationType="slide" visible={historyVisible} onRequestClose={() => setHistoryVisible(false)}>
        <SafeAreaView style={styles.root}>
          <GlassHeader
            title="Journal History"
            trailing={(
              <Pressable
                accessibilityLabel="Close Journal history"
                hitSlop={8}
                style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                onPress={() => setHistoryVisible(false)}
              >
                <Ionicons color={colors.text} name="close" size={23} />
              </Pressable>
            )}
          />
          {historyLoading
            ? (
                <View style={styles.centered}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              )
            : (
                <FlatList
                  contentContainerStyle={styles.historyList}
                  data={history}
                  keyExtractor={item => item.noteId}
                  ListEmptyComponent={(
                    <View style={styles.centered}>
                      <GlassSurface style={styles.historyEmptySurface}>
                        <Ionicons color={colors.accent} name="calendar-outline" size={28} />
                        <Text style={styles.dateLabel}>No earlier Journals</Text>
                      </GlassSurface>
                    </View>
                  )}
                  renderItem={({ item }) => (
                    <Pressable
                      style={({ pressed }) => [styles.historyRow, pressed && styles.historyRowPressed]}
                      onPress={() => void changeDate(item.journalDate)}
                    >
                      <Text style={styles.historyTitle}>
                        {new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(journalDateValue(item.journalDate))}
                      </Text>
                    </Pressable>
                  )}
                />
              )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

export function JournalScreen() {
  const runtimeState = useMobileRuntimeState()
  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dateMetadata}>Opening local database</Text>
      </SafeAreaView>
    )
  }
  if (runtimeState.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.dateLabel}>Startup failed</Text>
        <Text selectable style={styles.error}>{runtimeState.error.message}</Text>
      </SafeAreaView>
    )
  }
  return <JournalWorkspace runtime={runtimeState.runtime} />
}
