import type { MobileReading } from '@/files/mobile-reading-library'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { GlassHeader } from '@/ui/glass-header'
import { GlassSurface } from '@/ui/liquid-glass'
import { colors } from '@/ui/theme'

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
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
  emptyDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
    textAlign: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
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
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  format: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  importButton: {
    alignItems: 'center',
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 11,
  },
  importButtonPressed: {
    backgroundColor: colors.accentSoft,
  },
  importLabel: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    paddingBottom: 112,
    paddingHorizontal: 16,
  },
  metadata: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  readingIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 7,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  readingRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.44)',
    borderColor: colors.glassBorder,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  readingRowPressed: {
    backgroundColor: colors.accentSoft,
    transform: [{ scale: 0.985 }],
  },
  readingText: {
    flex: 1,
    minWidth: 0,
  },
  readingTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
})

function ReadingRow({ reading }: { reading: MobileReading }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.readingRow, pressed && styles.readingRowPressed]}
      onPress={() => router.push({ params: { readingId: reading.id }, pathname: '/reader/[readingId]' })}
    >
      <View style={styles.readingIcon}>
        <Ionicons color={colors.accent} name="book-outline" size={20} />
      </View>
      <View style={styles.readingText}>
        <Text numberOfLines={2} style={styles.readingTitle}>{reading.name}</Text>
        <Text style={styles.metadata}>
          <Text style={styles.format}>{reading.format}</Text>
          {`  ${Math.max(1, Math.round(reading.byteLength / 1024))} KB`}
        </Text>
      </View>
      <Ionicons color={colors.muted} name="chevron-forward" size={18} />
    </Pressable>
  )
}

export function ShelfScreen() {
  const runtimeState = useMobileRuntimeState()
  const [, setRevision] = useState(0)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const readings = runtimeState.status === 'ready' ? runtimeState.runtime.readings.list() : []

  const importReading = useCallback(async () => {
    if (runtimeState.status !== 'ready' || importing)
      return
    setImporting(true)
    setError(null)
    try {
      const imported = await runtimeState.runtime.readings.importFromPicker()
      if (imported)
        setRevision(current => current + 1)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setImporting(false)
    }
  }, [importing, runtimeState])

  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.emptyDescription}>Opening local Shelf</Text>
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
  return (
    <SafeAreaView style={styles.root}>
      <GlassHeader
        subtitle={readings.length === 1 ? '1 local reading' : `${readings.length} local readings`}
        title="Shelf"
        trailing={(
          <Pressable
            accessibilityLabel="Import publication"
            disabled={importing}
            style={({ pressed }) => [styles.importButton, pressed && styles.importButtonPressed]}
            onPress={() => void importReading()}
          >
            {importing
              ? <ActivityIndicator color={colors.accent} size="small" />
              : <Ionicons color={colors.accent} name="add" size={20} />}
            <Text style={styles.importLabel}>Import</Text>
          </Pressable>
        )}
      />
      {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
      <FlatList
        contentContainerStyle={readings.length === 0 ? styles.centered : styles.list}
        data={readings}
        keyExtractor={reading => reading.id}
        renderItem={({ item }) => <ReadingRow reading={item} />}
        ListEmptyComponent={(
          <GlassSurface style={styles.emptySurface}>
            <View style={styles.emptyIcon}>
              <Ionicons color={colors.accent} name="library-outline" size={24} />
            </View>
            <Text style={styles.emptyTitle}>Your Shelf is empty</Text>
            <Text style={styles.emptyDescription}>Import a PDF, EPUB, TXT, CBZ, or CBR file to read it locally.</Text>
          </GlassSurface>
        )}
      />
    </SafeAreaView>
  )
}
