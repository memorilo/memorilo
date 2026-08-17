import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { LearningCardDomHost } from '@/surfaces/learning-card-dom-host'
import { GlassHeader } from '@/ui/glass-header'
import { colors } from '@/ui/theme'

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
  const runtimeState = useMobileRuntimeState()
  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.status}>Opening learning database</Text>
      </SafeAreaView>
    )
  }
  if (runtimeState.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.title}>Startup failed</Text>
        <Text selectable style={styles.error}>{runtimeState.error.message}</Text>
      </SafeAreaView>
    )
  }
  return (
    <SafeAreaView style={styles.root}>
      <GlassHeader subtitle="Local review" title="Learning" />
      <View style={styles.surface}>
        <LearningCardDomHost runtime={runtimeState.runtime} />
      </View>
    </SafeAreaView>
  )
}
