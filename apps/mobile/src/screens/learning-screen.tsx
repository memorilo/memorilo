import type { LearningQueueMode } from '@memorilo/editor-storage'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { LearningCardDomHost } from '@/surfaces/learning-card-dom-host'
import { colors } from '@/ui/theme'
import { LearningOverview } from './learning-overview'

const styles = StyleSheet.create({
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
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 420,
    textAlign: 'center',
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  surface: {
    flex: 1,
  },
  status: {
    color: colors.muted,
    fontSize: 14,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
})

export function LearningScreen() {
  const { t } = useTranslation('learning')
  const runtimeState = useMobileRuntimeState()
  const [mode, setMode] = useState<LearningQueueMode>('mixed')
  const [surfaceRevision, setSurfaceRevision] = useState(0)
  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.status}>{t('nativeOpeningDatabase')}</Text>
      </SafeAreaView>
    )
  }
  if (runtimeState.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>{t('nativeStartupFailed')}</Text>
        <Text selectable style={styles.error}>{runtimeState.error.message}</Text>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaView style={styles.root}>
      <LearningOverview
        mode={mode}
        onModeChange={setMode}
        onQueueChanged={() => setSurfaceRevision(current => current + 1)}
        runtime={runtimeState.runtime}
      />
      <View style={styles.surface}>
        <LearningCardDomHost key={`${mode}:${surfaceRevision}`} mode={mode} runtime={runtimeState.runtime} />
      </View>
    </SafeAreaView>
  )
}
