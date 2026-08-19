import type {
  ShelfBrowseResult,
  ShelfPublication,
  ShelfReadingFormat,
  ShelfSource,
} from '@memorilo/shelf'
import type { MobileReading } from '@/files/mobile-reading-library'
import { Ionicons } from '@expo/vector-icons'
import { shelfReadingAcquisitions } from '@memorilo/shelf'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { ActionButton } from '@/ui/action-button'
import { EmptyState } from '@/ui/empty-state'
import { GlassHeader } from '@/ui/glass-header'
import { IconButton } from '@/ui/icon-button'
import { LiquidGlass } from '@/ui/liquid-glass'
import { TextField } from '@/ui/text-field'
import { colors } from '@/ui/theme'

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function formatBytes(byteLength: number): string {
  if (byteLength < 1024)
    return `${byteLength} B`
  if (byteLength < 1024 * 1024)
    return `${Math.max(1, Math.round(byteLength / 1024))} KB`
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`
}

function issueLabel(issue: NonNullable<ShelfBrowseResult['groups'][number]['issue']>, translate: (key: string, options?: Record<string, string | number>) => string): string {
  if (issue.kind === 'authentication')
    return translate('shelfSourceAuthenticationRequired')
  if (issue.kind === 'network')
    return translate('shelfSourceUnavailable')
  if (issue.kind === 'parse')
    return translate('shelfSourceInvalidCatalog')
  return 'status' in issue ? translate('shelfSourceRequestFailed', { status: issue.status }) : translate('shelfSourceUnavailable')
}

const styles = StyleSheet.create({
  catalogIssue: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(179, 38, 30, 0.18)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  catalogIssueText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 28,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  formatButton: {
    alignItems: 'center',
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  formatButtonPressed: {
    backgroundColor: colors.controlFillPressed,
    transform: [{ scale: 0.97 }],
  },
  formatLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  formButton: {
    flex: 1,
  },
  formHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
    marginTop: -4,
  },
  formTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 27,
    marginBottom: 5,
  },
  localIcon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  localRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingVertical: 11,
  },
  localText: {
    flex: 1,
    minWidth: 0,
  },
  localTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  metadata: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  modalBackdrop: {
    backgroundColor: colors.scrim,
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalSurface: {
    borderRadius: 28,
    margin: 12,
    padding: 20,
  },
  modalTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginBottom: 16,
  },
  modalCopy: {
    flex: 1,
  },
  pageBack: {
    alignItems: 'center',
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 11,
  },
  pageBackLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  pageTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 24,
  },
  pageSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  publicationAuthor: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  publicationRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 15,
  },
  publicationTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 21,
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  rowPressed: {
    backgroundColor: colors.surfacePressed,
    transform: [{ scale: 0.99 }],
  },
  section: {
    marginBottom: 24,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sourceChip: {
    alignItems: 'center',
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    marginRight: 8,
    minHeight: 42,
    paddingHorizontal: 13,
  },
  sourceChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: 'rgba(0, 113, 227, 0.22)',
  },
  sourceChipLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 600,
    maxWidth: 180,
  },
  sourceStrip: {
    paddingBottom: 2,
  },
  spinnerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    paddingVertical: 16,
  },
  spinnerText: {
    color: colors.muted,
    fontSize: 13,
  },
  content: {
    paddingBottom: 116,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
})

function LocalReadingRow({ onDelete, reading }: { onDelete: (reading: MobileReading) => void, reading: MobileReading }) {
  const { t } = useTranslation('app')
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.localRow, pressed && styles.rowPressed]}
      onPress={() => router.push({ params: { readingId: reading.id }, pathname: '/reader/[readingId]' })}
    >
      <View style={styles.localIcon}>
        <Ionicons color={colors.accent} name="book-outline" size={20} />
      </View>
      <View style={styles.localText}>
        <Text numberOfLines={2} style={styles.localTitle}>{reading.name}</Text>
        <Text style={styles.metadata}>
          {reading.location === 'cache'
            ? t('mobileShelfCached', { format: reading.format.toUpperCase(), size: formatBytes(reading.byteLength) })
            : t('mobileShelfFormatSize', { format: reading.format.toUpperCase(), size: formatBytes(reading.byteLength) })}
        </Text>
      </View>
      {reading.location === 'library'
        ? (
            <IconButton
              accessibilityLabel={t('mobileShelfDeleteReading')}
              onPress={(event) => {
                event.stopPropagation()
                onDelete(reading)
              }}
            >
              <Ionicons color={colors.muted} name="trash-outline" size={18} />
            </IconButton>
          )
        : null}
      <Ionicons color={colors.muted} name="chevron-forward" size={18} />
    </Pressable>
  )
}

function PublicationRow({
  downloading,
  onDownload,
  publication,
}: {
  downloading: string | null
  onDownload: (format: ShelfReadingFormat) => void
  publication: ShelfPublication
}) {
  const { t } = useTranslation('app')
  const acquisitions = shelfReadingAcquisitions(publication)
  return (
    <View style={styles.publicationRow}>
      <Text numberOfLines={2} style={styles.publicationTitle}>{publication.title}</Text>
      {publication.authors.length > 0
        ? <Text numberOfLines={2} style={styles.publicationAuthor}>{publication.authors.join(', ')}</Text>
        : null}
      {publication.subtitle ? <Text numberOfLines={2} style={styles.pageSubtitle}>{publication.subtitle}</Text> : null}
      <ScrollView contentContainerStyle={{ gap: 7 }} horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        {acquisitions.map(acquisition => (
          <Pressable
            key={acquisition.format}
            accessibilityLabel={t('mobileShelfDownload', { format: acquisition.format.toUpperCase() })}
            disabled={downloading !== null}
            style={({ pressed }) => [styles.formatButton, pressed && styles.formatButtonPressed, downloading === `${publication.id}:${acquisition.format}` && { opacity: 0.55 }]}
            onPress={() => onDownload(acquisition.format)}
          >
            {downloading === `${publication.id}:${acquisition.format}`
              ? <ActivityIndicator color={colors.accent} size="small" />
              : <Ionicons color={colors.accent} name="download-outline" size={15} />}
            <Text style={styles.formatLabel}>{acquisition.format}</Text>
          </Pressable>
        ))}
        {acquisitions.length === 0 ? <Text style={styles.metadata}>{t('mobileShelfNoReadableFile')}</Text> : null}
      </ScrollView>
    </View>
  )
}

function AddSourceModal({
  busy,
  error,
  source,
  onClose,
  onRemove,
  onSubmit,
}: {
  busy: boolean
  error: string | null
  source?: ShelfSource
  onClose: () => void
  onRemove?: () => void
  onSubmit: (input: { name: string, password: string, url: string, username: string }) => void
}) {
  const { t } = useTranslation('app')
  const [name, setName] = useState(source?.name ?? '')
  const [url, setUrl] = useState(source?.url ?? '')
  const [username, setUsername] = useState(source?.username ?? '')
  const [password, setPassword] = useState('')
  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
        <LiquidGlass style={styles.modalSurface} variant="surface">
          <View style={styles.modalTopRow}>
            <View style={styles.modalCopy}>
              <Text style={styles.formTitle}>{source ? t('shelfEditBookSource') : t('mobileShelfAddBookSourceTitle')}</Text>
              <Text style={styles.formHint}>{source ? t('shelfChooseSourceToUpdate') : t('mobileShelfAddBookSourceHint')}</Text>
            </View>
            <IconButton accessibilityLabel={t('mobileShelfClose')} onPress={onClose}>
              <Ionicons color={colors.muted} name="close" size={23} />
            </IconButton>
          </View>
          <TextField autoCapitalize="none" autoCorrect={false} placeholder={t('mobileShelfCatalogUrl')} value={url} onChangeText={setUrl} />
          <TextField placeholder={t('mobileShelfNameOptional')} value={name} onChangeText={setName} />
          <TextField autoCapitalize="none" autoCorrect={false} placeholder={t('mobileShelfUsernameOptional')} value={username} onChangeText={setUsername} />
          <TextField autoCapitalize="none" autoCorrect={false} placeholder={t('mobileShelfPasswordOptional')} secureTextEntry value={password} onChangeText={setPassword} />
          {error ? <Text selectable style={styles.error}>{error}</Text> : null}
          <View style={styles.formActions}>
            <ActionButton label={t('shelfCancel')} style={styles.formButton} onPress={onClose} />
            <ActionButton
              disabled={busy}
              label={source ? t('shelfSaveChanges') : t('mobileShelfConnect')}
              leading={busy ? <ActivityIndicator color={colors.accentOn} size="small" /> : <Ionicons color={colors.accentOn} name="add" size={18} />}
              style={styles.formButton}
              tone="primary"
              onPress={() => onSubmit({ name, password, url, username })}
            />
          </View>
          {source && onRemove
            ? (
                <ActionButton
                  disabled={busy}
                  label={t('shelfRemoveSource')}
                  leading={<Ionicons color={colors.danger} name="trash-outline" size={17} />}
                  tone="danger"
                  onPress={onRemove}
                />
              )
            : null}
        </LiquidGlass>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export function ShelfScreen() {
  const { t } = useTranslation('app')
  const runtimeState = useMobileRuntimeState()
  const runtime = runtimeState.status === 'ready' ? runtimeState.runtime : null
  const [, setReadingsRevision] = useState(0)
  const [sources, setSources] = useState<readonly ShelfSource[]>([])
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState<string | undefined>(undefined)
  const [catalog, setCatalog] = useState<ShelfBrowseResult | null>(null)
  const [catalogBusy, setCatalogBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [sourceModalVisible, setSourceModalVisible] = useState(false)
  const [editingSource, setEditingSource] = useState<ShelfSource | null>(null)
  const [sourceBusy, setSourceBusy] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [sourceFormError, setSourceFormError] = useState<string | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)
  const readings = runtime?.readings.list() ?? []
  const cacheSummary = runtime?.readings.getCacheSummary() ?? { activeCount: 0, cachedBytes: 0, cachedCount: 0 }
  const selectedGroup = catalog?.groups.find(group => group.source.id === selectedSourceId) ?? null
  const page = selectedGroup?.page ?? null

  useEffect(() => {
    if (!runtime)
      return
    let active = true
    void runtime.shelfSources.list().then((next) => {
      if (!active)
        return
      setSources(next)
      setSelectedSourceId(current => current && next.some(source => source.id === current) ? current : next[0]?.id ?? null)
    }).catch((failure) => {
      if (active)
        setError(toError(failure))
    })
    return () => {
      active = false
    }
  }, [runtime])

  const loadCatalog = useCallback(async (sourceId: string, nextPageUrl: string | undefined, forceRefresh: boolean) => {
    if (!runtime)
      return
    setCatalogBusy(true)
    setError(null)
    try {
      const next = forceRefresh
        ? await runtime.shelfCatalog.refreshView({ pageUrl: nextPageUrl, sourceId })
        : await runtime.shelfCatalog.cachedView({ pageUrl: nextPageUrl, sourceId })
      setCatalog(next)
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setCatalogBusy(false)
    }
  }, [runtime])

  useEffect(() => {
    if (!runtime || !selectedSourceId)
      return
    void loadCatalog(selectedSourceId, pageUrl, false)
  }, [loadCatalog, pageUrl, runtime, selectedSourceId])

  const refresh = useCallback(async () => {
    if (!selectedSourceId)
      return
    setRefreshing(true)
    await loadCatalog(selectedSourceId, pageUrl, true)
    setRefreshing(false)
  }, [loadCatalog, pageUrl, selectedSourceId])

  const addSource = useCallback(async (input: { name: string, password: string, url: string, username: string }) => {
    if (!runtime || sourceBusy)
      return
    setSourceBusy(true)
    setSourceFormError(null)
    try {
      const source = await runtime.shelfSources.add({
        ...(input.name.trim() ? { name: input.name } : {}),
        ...(input.password.trim() ? { password: input.password } : {}),
        url: input.url,
        ...(input.username.trim() ? { username: input.username } : {}),
      })
      const next = await runtime.shelfSources.list()
      setSources(next)
      setSelectedSourceId(source.id)
      setPageUrl(undefined)
      setSourceModalVisible(false)
    }
    catch (failure) {
      setSourceFormError(toError(failure).message)
    }
    finally {
      setSourceBusy(false)
    }
  }, [runtime, sourceBusy])

  const updateSource = useCallback(async (input: { name: string, password: string, url: string, username: string }) => {
    if (!runtime || !editingSource || sourceBusy)
      return
    setSourceBusy(true)
    setSourceFormError(null)
    try {
      const source = await runtime.shelfSources.update({
        id: editingSource.id,
        name: input.name,
        password: input.password,
        url: input.url,
        username: input.username,
      })
      const next = await runtime.shelfSources.list()
      setSources(next)
      setSelectedSourceId(source.id)
      setPageUrl(undefined)
      setCatalog(null)
      setEditingSource(null)
      setSourceModalVisible(false)
    }
    catch (failure) {
      setSourceFormError(toError(failure).message)
    }
    finally {
      setSourceBusy(false)
    }
  }, [editingSource, runtime, sourceBusy])

  const removeSource = useCallback(() => {
    if (!runtime || !editingSource || sourceBusy)
      return
    Alert.alert(
      t('shelfRemoveSourceQuestion', { name: editingSource.name }),
      t('shelfRemoveSourceExplanation'),
      [
        { text: t('shelfCancelRemoval'), style: 'cancel' },
        {
          text: t('shelfRemoveSource'),
          style: 'destructive',
          onPress: () => {
            setSourceBusy(true)
            void runtime.shelfSources.remove(editingSource.id)
              .then(async () => {
                const next = await runtime.shelfSources.list()
                setSources(next)
                setSelectedSourceId(current => current === editingSource.id ? next[0]?.id ?? null : current)
                setPageUrl(undefined)
                setCatalog(null)
                setEditingSource(null)
                setSourceModalVisible(false)
              })
              .catch((failure: unknown) => setSourceFormError(toError(failure).message))
              .finally(() => setSourceBusy(false))
          },
        },
      ],
    )
  }, [editingSource, runtime, sourceBusy, t])

  const download = useCallback(async (publication: ShelfPublication, format: ShelfReadingFormat) => {
    if (!runtime || !selectedSourceId || downloading || importing)
      return
    setDownloading(`${publication.id}:${format}`)
    setError(null)
    try {
      const result = await runtime.shelfCatalog.downloadPublication({ format, publicationId: publication.id, sourceId: selectedSourceId })
      const reading = await runtime.readings.saveShelfReading({
        authors: publication.authors,
        bytes: result.bytes,
        format,
        name: publication.title,
        originalName: `${publication.title}.${format}`,
        publicationId: publication.id,
        retention: 'cache',
        sourceId: selectedSourceId,
      })
      setReadingsRevision(current => current + 1)
      router.push({ params: { readingId: reading.id }, pathname: '/reader/[readingId]' })
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setDownloading(null)
    }
  }, [downloading, importing, runtime, selectedSourceId])

  const importReading = useCallback(async () => {
    if (!runtime || importing || downloading)
      return
    setImporting(true)
    setError(null)
    try {
      const reading = await runtime.readings.importFromPicker()
      if (!reading)
        return
      setReadingsRevision(current => current + 1)
      router.push({ params: { readingId: reading.id }, pathname: '/reader/[readingId]' })
    }
    catch (failure) {
      setError(toError(failure))
    }
    finally {
      setImporting(false)
    }
  }, [downloading, importing, runtime])

  const clearUnusedCache = useCallback(() => {
    if (!runtime || cacheBusy || cacheSummary.cachedCount === 0)
      return
    Alert.alert(
      t('mobileShelfClearCacheTitle'),
      cacheSummary.activeCount > 0
        ? t('mobileShelfClearCacheMessage', { count: cacheSummary.cachedCount - cacheSummary.activeCount })
        : t('mobileShelfClearCacheMessage', { count: cacheSummary.cachedCount }),
      [
        { text: t('shelfCancel'), style: 'cancel' },
        {
          text: t('mobileShelfClearCache'),
          style: 'destructive',
          onPress: () => {
            setCacheBusy(true)
            void runtime.readings.clearUnusedCache().then(() => {
              setReadingsRevision(current => current + 1)
            }).catch((failure: unknown) => {
              setError(toError(failure))
            }).finally(() => setCacheBusy(false))
          },
        },
      ],
    )
  }, [cacheBusy, cacheSummary.activeCount, cacheSummary.cachedCount, runtime, t])

  const deleteReading = useCallback((reading: MobileReading) => {
    if (!runtime || reading.location !== 'library')
      return
    Alert.alert(
      t('mobileShelfDeleteReadingTitle', { name: reading.name }),
      t('mobileShelfDeleteReadingMessage'),
      [
        { text: t('shelfCancel'), style: 'cancel' },
        {
          text: t('mobileShelfDeleteReadingAction'),
          style: 'destructive',
          onPress: () => {
            void runtime.readings.deleteFromLibrary(reading.id)
              .then(() => setReadingsRevision(current => current + 1))
              .catch((failure: unknown) => setError(toError(failure)))
          },
        },
      ],
    )
  }, [runtime, t])

  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.spinnerText}>{t('shelfOpening')}</Text>
      </SafeAreaView>
    )
  }
  if (runtimeState.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.formTitle}>{t('mobileStartupFailed')}</Text>
        <Text selectable style={styles.error}>{runtimeState.error.message}</Text>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaView style={styles.root}>
      <GlassHeader
        subtitle={sources.length === 0
          ? t('mobileShelfLocalReading', { count: readings.length })
          : t('mobileShelfSourceCount', { readings: readings.length, count: sources.length })}
        title={t('shelf')}
        trailing={(
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton accessibilityLabel={t('shelfReadBook')} disabled={importing || downloading !== null} onPress={() => void importReading()}>
              {importing ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.accent} name="folder-open-outline" size={20} />}
            </IconButton>
            <IconButton accessibilityLabel={t('shelfRefreshWithStatus', { status: '' })} disabled={!selectedSourceId || refreshing} onPress={() => void refresh()}>
              {refreshing ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.text} name="refresh" size={19} />}
            </IconButton>
            <IconButton
              accessibilityLabel={t('shelfAddBookSource')}
              onPress={() => {
                setEditingSource(null)
                setSourceFormError(null)
                setSourceModalVisible(true)
              }}
            >
              <Ionicons color={colors.accent} name="add" size={21} />
            </IconButton>
          </View>
        )}
      />
      {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl colors={[colors.accent]} refreshing={refreshing} tintColor={colors.accent} onRefresh={() => void refresh()} />}
      >
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{t('shelfBookSources')}</Text>
            {sources.length > 0
              ? (
                  <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
                    <IconButton
                      accessibilityLabel={t('shelfEditBookSource')}
                      onPress={() => {
                        const source = sources.find(candidate => candidate.id === selectedSourceId) ?? sources[0]
                        if (!source)
                          return
                        setEditingSource(source)
                        setSourceFormError(null)
                        setSourceModalVisible(true)
                      }}
                    >
                      <Ionicons color={colors.muted} name="create-outline" size={17} />
                    </IconButton>
                    <Text style={styles.metadata}>{sources.length}</Text>
                  </View>
                )
              : null}
          </View>
          {sources.length === 0
            ? <EmptyState description={t('shelfAddSourceHint')} icon={<Ionicons color={colors.accent} name="globe-outline" size={24} />} title={t('shelfNoBookSources')} />
            : (
                <ScrollView contentContainerStyle={styles.sourceStrip} horizontal showsHorizontalScrollIndicator={false}>
                  {sources.map(source => (
                    <Pressable
                      key={source.id}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.sourceChip,
                        selectedSourceId === source.id && styles.sourceChipActive,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() => {
                        setSelectedSourceId(source.id)
                        setPageUrl(undefined)
                      }}
                      onLongPress={() => {
                        setEditingSource(source)
                        setSourceFormError(null)
                        setSourceModalVisible(true)
                      }}
                    >
                      <Ionicons color={selectedSourceId === source.id ? colors.accent : colors.muted} name="globe-outline" size={17} />
                      <Text numberOfLines={1} style={styles.sourceChipLabel}>{source.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{page?.title ?? t('mobileShelfCatalog')}</Text>
            {catalogBusy ? <ActivityIndicator color={colors.accent} size="small" /> : null}
          </View>
          {selectedGroup?.issue ? <View style={styles.catalogIssue}><Text style={styles.catalogIssueText}>{issueLabel(selectedGroup.issue, t)}</Text></View> : null}
          {page
            ? (
                <>
                  {pageUrl
                    ? (
                        <Pressable style={({ pressed }) => [styles.pageBack, pressed && styles.rowPressed]} onPress={() => setPageUrl(undefined)}>
                          <Ionicons color={colors.text} name="arrow-back" size={16} />
                          <Text style={styles.pageBackLabel}>{t('mobileShelfSourceHome')}</Text>
                        </Pressable>
                      )
                    : null}
                  {page.subtitle ? <Text style={styles.pageSubtitle}>{page.subtitle}</Text> : null}
                  {page.navigation.map(item => (
                    <Pressable key={item.href} style={({ pressed }) => [styles.localRow, pressed && styles.rowPressed]} onPress={() => setPageUrl(item.href)}>
                      <View style={styles.localIcon}><Ionicons color={colors.accent} name="folder-open-outline" size={19} /></View>
                      <View style={styles.localText}>
                        <Text numberOfLines={1} style={styles.localTitle}>{item.title}</Text>
                        {item.subtitle ? <Text numberOfLines={1} style={styles.metadata}>{item.subtitle}</Text> : null}
                      </View>
                      <Ionicons color={colors.muted} name="chevron-forward" size={18} />
                    </Pressable>
                  ))}
                  {page.publications.map(publication => <PublicationRow key={publication.id} downloading={downloading} onDownload={format => void download(publication, format)} publication={publication} />)}
                  {page.navigation.length === 0 && page.publications.length === 0 ? <EmptyState description={t('mobileShelfCatalogEmptyDescription')} icon={<Ionicons color={colors.accent} name="library-outline" size={24} />} title={t('mobileShelfCatalogEmptyTitle')} /> : null}
                </>
              )
            : sources.length > 0
              ? <Text style={styles.spinnerText}>{t('mobileShelfRefreshHint')}</Text>
              : <Text style={styles.spinnerText}>{t('mobileShelfAddSourceHintNative')}</Text>}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>{t('mobileShelfDevice')}</Text>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: 5 }}>
              {cacheSummary.cachedCount > 0
                ? (
                    <IconButton accessibilityLabel={t('mobileShelfClearCache')} disabled={cacheBusy} onPress={clearUnusedCache}>
                      {cacheBusy
                        ? <ActivityIndicator color={colors.muted} size="small" />
                        : <Ionicons color={colors.muted} name="trash-outline" size={17} />}
                    </IconButton>
                  )
                : null}
              <Text style={styles.metadata}>{readings.length}</Text>
            </View>
          </View>
          {readings.length === 0
            ? <EmptyState description={t('mobileShelfEmptyDescription')} icon={<Ionicons color={colors.accent} name="library-outline" size={24} />} title={t('mobileShelfEmptyTitle')} />
            : readings.map(reading => <LocalReadingRow key={reading.id} onDelete={deleteReading} reading={reading} />)}
        </View>
      </ScrollView>
      {sourceModalVisible
        ? (
            <AddSourceModal
              busy={sourceBusy}
              error={sourceFormError}
              source={editingSource ?? undefined}
              onClose={() => setSourceModalVisible(false)}
              onRemove={editingSource ? removeSource : undefined}
              onSubmit={input => void (editingSource ? updateSource(input) : addSource(input))}
            />
          )
        : null}
    </SafeAreaView>
  )
}
