import type { AssetStatistics, ShelfImageCacheStatistics } from '@memorilo/editor-storage'
import type { MobileAppearancePreference } from '@/application/mobile-appearance'
import type { MobileRuntime } from '@/application/mobile-runtime'
import type { MobilePermissionDiagnostics, MobileStorageSnapshot } from '@/files/mobile-storage'
import { Ionicons } from '@expo/vector-icons'
import { serializeMainDatabaseSchemaInspection } from '@memorilo/editor-storage'
import { Directory, File, Paths } from 'expo-file-system'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileAppearance } from '@/application/mobile-appearance-hook'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { GlassHeader } from '@/ui/glass-header'
import { SegmentedControl } from '@/ui/segmented-control'
import { colors } from '@/ui/theme'

function formatBytes(byteLength: number): string {
  if (byteLength < 1024)
    return `${byteLength} B`
  if (byteLength < 1024 * 1024)
    return `${Math.max(1, Math.round(byteLength / 1024))} KB`
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 14,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionText: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  actionValue: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  centered: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 28,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 12,
  },
  metadata: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    gap: 10,
    marginBottom: 24,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  status: {
    color: colors.muted,
    fontSize: 14,
  },
  value: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    paddingBottom: 116,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  diagnosticRow: {
    alignItems: 'flex-start',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 16,
    minHeight: 46,
    paddingVertical: 10,
  },
  diagnosticLabel: {
    color: colors.muted,
    flex: 0.9,
    fontSize: 13,
  },
  diagnosticValue: {
    color: colors.text,
    flex: 1.4,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
})

function RuntimeSettings({ runtime }: { runtime: MobileRuntime }) {
  const { t } = useTranslation('settings')
  const appearance = useMobileAppearance()
  const [assetStatistics, setAssetStatistics] = useState<AssetStatistics | null>(null)
  const [busy, setBusy] = useState<'assets' | 'cache' | 'covers' | 'export' | 'exports' | 'import' | 'schema' | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [permissions, setPermissions] = useState<MobilePermissionDiagnostics | null>(null)
  const [shelfImageCache, setShelfImageCache] = useState<ShelfImageCacheStatistics | null>(null)
  const [storage, setStorage] = useState<MobileStorageSnapshot | null>(null)
  const cacheSummary = runtime.readings.getCacheSummary()

  const setAppearance = useCallback((nextPreference: MobileAppearancePreference) => {
    void appearance.setPreference(nextPreference).catch((failure: unknown) => {
      setError(failure instanceof Error ? failure : new Error(String(failure)))
    })
  }, [appearance])

  const refresh = useCallback(async () => {
    try {
      const [nextAssetStatistics, nextPermissions, nextShelfImageCache] = await Promise.all([
        runtime.editor.assets.getStatistics(),
        runtime.storage.inspectPermissions(),
        runtime.shelfImageCache.getStatistics(),
      ])
      setAssetStatistics(nextAssetStatistics)
      setPermissions(nextPermissions)
      setShelfImageCache(nextShelfImageCache)
      setStorage(runtime.storage.inspect())
      setError(null)
    }
    catch (failure) {
      setError(failure instanceof Error ? failure : new Error(String(failure)))
    }
  }, [runtime])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const clearCache = useCallback(() => {
    if (busy !== null || cacheSummary.cachedCount === 0)
      return
    Alert.alert(
      t('mobileClearCacheTitle'),
      t('mobileClearCacheMessage', { count: cacheSummary.cachedCount - cacheSummary.activeCount }),
      [
        { text: t('mobileCancel'), style: 'cancel' },
        {
          text: t('mobileClearCacheAction'),
          style: 'destructive',
          onPress: () => {
            setBusy('cache')
            void runtime.readings.clearUnusedCache()
              .then(() => refresh())
              .catch((failure: unknown) => setError(failure instanceof Error ? failure : new Error(String(failure))))
              .finally(() => setBusy(null))
          },
        },
      ],
    )
  }, [busy, cacheSummary.activeCount, cacheSummary.cachedCount, refresh, runtime, t])

  const clearShelfImageCache = useCallback(() => {
    if (busy !== null || shelfImageCache === null || shelfImageCache.entryCount === 0)
      return
    Alert.alert(
      t('mobileClearCoverCacheTitle'),
      t('mobileClearCoverCacheMessage', { count: shelfImageCache.entryCount }),
      [
        { text: t('mobileCancel'), style: 'cancel' },
        {
          text: t('mobileClearCacheAction'),
          style: 'destructive',
          onPress: () => {
            setBusy('covers')
            void runtime.shelfImageCache.clear()
              .then(() => refresh())
              .catch((failure: unknown) => setError(failure instanceof Error ? failure : new Error(String(failure))))
              .finally(() => setBusy(null))
          },
        },
      ],
    )
  }, [busy, refresh, runtime, shelfImageCache, t])

  const clearGeneratedExports = useCallback(() => {
    if (busy !== null || storage === null || storage.generatedExports.fileCount === 0)
      return
    Alert.alert(
      t('mobileClearExportsTitle'),
      t('mobileClearExportsMessage', { count: storage.generatedExports.fileCount }),
      [
        { text: t('mobileCancel'), style: 'cancel' },
        {
          text: t('mobileClearExportsAction'),
          style: 'destructive',
          onPress: () => {
            setBusy('exports')
            try {
              runtime.storage.clearGeneratedExports()
              setStorage(runtime.storage.inspect())
              setError(null)
            }
            catch (failure) {
              setError(failure instanceof Error ? failure : new Error(String(failure)))
            }
            finally {
              setBusy(null)
            }
          },
        },
      ],
    )
  }, [busy, runtime, storage, t])

  const collectAssets = useCallback(() => {
    if (busy !== null)
      return
    Alert.alert(
      t('mobileRemoveAssetsTitle'),
      t('mobileRemoveAssetsMessage'),
      [
        { text: t('mobileCancel'), style: 'cancel' },
        {
          text: t('mobileRemoveAssetsAction'),
          style: 'destructive',
          onPress: () => {
            setBusy('assets')
            void runtime.assets.collectUnreferenced({ unreferencedBefore: Date.now() - 24 * 60 * 60 * 1000 })
              .then(() => refresh())
              .catch((failure: unknown) => setError(failure instanceof Error ? failure : new Error(String(failure))))
              .finally(() => setBusy(null))
          },
        },
      ],
    )
  }, [busy, refresh, runtime, t])

  const exportDatabase = useCallback(() => {
    if (busy !== null)
      return
    setBusy('export')
    void runtime.databaseTransfer.exportDatabase()
      .then(async (result) => {
        await Share.share({
          title: t('mobileDatabaseBackupTitle'),
          url: result.file.uri,
        })
        setStorage(runtime.storage.inspect())
      })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure : new Error(String(failure))))
      .finally(() => setBusy(null))
  }, [busy, runtime, t])

  const importDatabase = useCallback(() => {
    if (busy !== null)
      return
    setBusy('import')
    void runtime.databaseTransfer.stageImportFromPicker()
      .then((result) => {
        if (result.status === 'cancelled')
          return
        Alert.alert(
          t('mobileImportStagedTitle'),
          t('mobileImportStagedMessage', { fileName: result.fileName }),
        )
      })
      .catch((failure: unknown) => setError(failure instanceof Error ? failure : new Error(String(failure))))
      .finally(() => setBusy(null))
  }, [busy, runtime, t])

  const exportSchema = useCallback(() => {
    if (busy !== null)
      return
    setBusy('schema')
    void (async () => {
      const directory = new Directory(Paths.document, 'memorilo-exports')
      directory.create({ idempotent: true, intermediates: true })
      const file = new File(directory, `Memorilo-schema-${new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '')}.json`)
      file.create({ intermediates: true, overwrite: true })
      file.write(serializeMainDatabaseSchemaInspection(runtime.schema))
      await Share.share({
        title: t('mobileSchemaInspectionTitle'),
        url: file.uri,
      })
      setStorage(runtime.storage.inspect())
    })()
      .catch((failure: unknown) => setError(failure instanceof Error ? failure : new Error(String(failure))))
      .finally(() => setBusy(null))
  }, [busy, runtime, t])

  return (
    <SafeAreaView style={styles.root}>
      <GlassHeader title={t('title')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('mobileAppearance')}</Text>
          <Text style={styles.metadata}>{t('mobileAppearanceDescription')}</Text>
          <SegmentedControl
            accessibilityLabel={t('mobileAppearance')}
            options={[
              { id: 'automatic', label: t('mobileAppearanceAutomatic') },
              { id: 'solid', label: t('mobileAppearanceSolid') },
            ]}
            selected={appearance.preference}
            disabled={appearance.pending || !appearance.ready}
            onChange={setAppearance}
          />
          {appearance.error ? <Text selectable style={styles.error}>{appearance.error.message}</Text> : null}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('storage')}</Text>
          <Text style={styles.metadata}>{t('mobileStorageDescription')}</Text>
          <Text style={styles.value}>
            {t('mobileMainGeneration')}
            {' '}
            {runtime.schema.userVersion}
          </Text>
          <Text style={styles.metadata}>
            {t('mobileLearningGeneration')}
            {' '}
            {runtime.schema.learningSchemaGeneration ?? t('mobileMissing')}
            {' '}
            ·
            {' '}
            {runtime.schema.objects.length}
            {' '}
            {t('mobileApplicationObjects')}
          </Text>
          <Text style={styles.metadata}>
            {t('mobileSqliteCapabilities', { version: runtime.capabilities.sqliteVersion })}
          </Text>
          <Pressable accessibilityRole="button" disabled={busy !== null} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfacePressed }, busy !== null && styles.actionDisabled]} onPress={exportSchema}>
            <Ionicons color={colors.accent} name="document-text-outline" size={21} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>{t('mobileExportSchema')}</Text>
              <Text style={styles.actionValue}>{t('mobileExportSchemaDescription')}</Text>
            </View>
            {busy === 'schema' ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.muted} name="chevron-forward" size={18} />}
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('mobileStorageSection')}</Text>
          <Text style={styles.value}>
            {storage
              ? t('mobileManagedStorageUsage', { free: formatBytes(storage.availableDiskBytes), used: formatBytes(storage.totalManagedBytes) })
              : t('mobileStorageCalculating')}
          </Text>
          {storage
            ? (
                <Text style={styles.metadata}>
                  {t('mobileStorageBreakdown', {
                    assets: formatBytes(storage.assets.byteSize),
                    database: formatBytes(storage.databaseBytes),
                    readings: formatBytes(storage.readingCache.byteSize + storage.readingLibrary.byteSize),
                  })}
                </Text>
              )
            : null}
          <Pressable accessibilityRole="button" disabled={busy !== null || cacheSummary.cachedCount === 0} style={({ pressed }) => [styles.action, (pressed || busy === 'cache') && { backgroundColor: colors.surfacePressed }, (busy !== null || cacheSummary.cachedCount === 0) && styles.actionDisabled]} onPress={clearCache}>
            <Ionicons color={colors.accent} name="trash-outline" size={21} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>{t('mobileClearCache')}</Text>
              <Text style={styles.actionValue}>{t('mobileCacheSummary', { active: cacheSummary.activeCount, count: cacheSummary.cachedCount, size: formatBytes(cacheSummary.cachedBytes) })}</Text>
            </View>
            {busy === 'cache' ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.muted} name="chevron-forward" size={18} />}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy !== null || shelfImageCache === null || shelfImageCache.entryCount === 0} style={({ pressed }) => [styles.action, (pressed || busy === 'covers') && { backgroundColor: colors.surfacePressed }, (busy !== null || shelfImageCache === null || shelfImageCache.entryCount === 0) && styles.actionDisabled]} onPress={clearShelfImageCache}>
            <Ionicons color={colors.accent} name="albums-outline" size={21} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>{t('mobileClearCoverCache')}</Text>
              <Text style={styles.actionValue}>{shelfImageCache ? t('mobileCoverCacheSummary', { count: shelfImageCache.entryCount, size: formatBytes(shelfImageCache.byteSize) }) : t('mobileStorageCalculating')}</Text>
            </View>
            {busy === 'covers' ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.muted} name="chevron-forward" size={18} />}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy !== null} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfacePressed }, busy !== null && styles.actionDisabled]} onPress={collectAssets}>
            <Ionicons color={colors.accent} name="images-outline" size={21} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>{t('mobileRemoveAssets')}</Text>
              <Text style={styles.actionValue}>{assetStatistics ? t('mobileAssetStatistics', { managed: assetStatistics.managedAssetCount, references: assetStatistics.referenceCount }) : t('mobileAssetStatisticsLoading')}</Text>
            </View>
            {busy === 'assets' ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.muted} name="chevron-forward" size={18} />}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy !== null || storage === null || storage.generatedExports.fileCount === 0} style={({ pressed }) => [styles.action, (pressed || busy === 'exports') && { backgroundColor: colors.surfacePressed }, (busy !== null || storage === null || storage.generatedExports.fileCount === 0) && styles.actionDisabled]} onPress={clearGeneratedExports}>
            <Ionicons color={colors.accent} name="folder-open-outline" size={21} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>{t('mobileClearGeneratedExports')}</Text>
              <Text style={styles.actionValue}>{storage ? t('mobileGeneratedExportsSummary', { count: storage.generatedExports.fileCount, size: formatBytes(storage.generatedExports.byteSize) }) : t('mobileStorageCalculating')}</Text>
            </View>
            {busy === 'exports' ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.muted} name="chevron-forward" size={18} />}
          </Pressable>
          {error ? <Text selectable style={styles.error}>{error.message}</Text> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('mobileDiagnostics')}</Text>
          <Text style={styles.metadata}>{t('mobileDiagnosticsDescription')}</Text>
          <View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobilePlatform')}</Text>
              <Text style={styles.diagnosticValue}>
                {Platform.OS}
                {' '}
                {String(Platform.Version)}
              </Text>
            </View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobileLocalOnly')}</Text>
              <Text style={styles.diagnosticValue}>{t('mobileLocalOnlyValue')}</Text>
            </View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobileStorageAccess')}</Text>
              <Text style={styles.diagnosticValue}>{permissions?.managedStorageWritable ? t('mobileStorageAccessValue') : t('mobileDiagnosticsUnavailable')}</Text>
            </View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobileSecureCredentials')}</Text>
              <Text style={styles.diagnosticValue}>{permissions?.secureCredentialsAvailable ? t('mobileSecureCredentialsValue') : t('mobileDiagnosticsUnavailable')}</Text>
            </View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobileFileImportAccess')}</Text>
              <Text style={styles.diagnosticValue}>{permissions?.fileImportUsesSystemPicker ? t('mobileFileImportAccessValue') : t('mobileDiagnosticsUnavailable')}</Text>
            </View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobileAvailableStorage')}</Text>
              <Text style={styles.diagnosticValue}>{storage ? t('mobileAvailableStorageValue', { available: formatBytes(storage.availableDiskBytes), total: formatBytes(storage.totalDiskBytes) }) : t('mobileStorageCalculating')}</Text>
            </View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobileDatabaseCapabilities')}</Text>
              <Text style={styles.diagnosticValue}>
                {runtime.capabilities.sqliteVersion}
                {' '}
                ·
                {' '}
                {t('mobileFts5Capability')}
                {' '}
                ·
                {' '}
                {t('mobileVecCapability')}
              </Text>
            </View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobileReadingFiles')}</Text>
              <Text style={styles.diagnosticValue}>{t('mobileReadingFilesValue', { cache: cacheSummary.cachedCount, library: runtime.readings.list().filter(reading => reading.location === 'library').length })}</Text>
            </View>
            <View style={styles.diagnosticRow}>
              <Text style={styles.diagnosticLabel}>{t('mobileRecoveryFiles')}</Text>
              <Text style={styles.diagnosticValue}>{storage ? t('mobileRecoveryFilesValue', { count: storage.recoveryFiles.fileCount, size: formatBytes(storage.recoveryFiles.byteSize) }) : t('mobileStorageCalculating')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('mobileBackupRestore')}</Text>
          <Text style={styles.metadata}>{t('mobileBackupDescription')}</Text>
          <Pressable accessibilityRole="button" disabled={busy !== null} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfacePressed }, busy !== null && styles.actionDisabled]} onPress={exportDatabase}>
            <Ionicons color={colors.accent} name="share-outline" size={21} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>{t('mobileExportBackup')}</Text>
              <Text style={styles.actionValue}>{t('mobileExportBackupDescription')}</Text>
            </View>
            {busy === 'export' ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.muted} name="chevron-forward" size={18} />}
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy !== null} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfacePressed }, busy !== null && styles.actionDisabled]} onPress={importDatabase}>
            <Ionicons color={colors.accent} name="archive-outline" size={21} />
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>{t('mobileImportBackup')}</Text>
              <Text style={styles.actionValue}>{t('mobileImportBackupDescription')}</Text>
            </View>
            {busy === 'import' ? <ActivityIndicator color={colors.accent} size="small" /> : <Ionicons color={colors.muted} name="chevron-forward" size={18} />}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

export function SettingsScreen() {
  const { t } = useTranslation('settings')
  const runtimeState = useMobileRuntimeState()
  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.status}>{t('mobileOpeningSettings')}</Text>
      </SafeAreaView>
    )
  }
  if (runtimeState.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.value}>{t('mobileStartupFailed')}</Text>
        <Text selectable style={styles.error}>{runtimeState.error.message}</Text>
      </SafeAreaView>
    )
  }
  return <RuntimeSettings runtime={runtimeState.runtime} />
}
