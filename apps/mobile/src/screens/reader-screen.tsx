import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { ReaderDomHost } from '@/surfaces/reader-dom-host'
import { GlassHeader } from '@/ui/glass-header'
import { colors } from '@/ui/theme'

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backButtonPressed: {
    backgroundColor: colors.accentSoft,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    padding: 24,
    textAlign: 'center',
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  surface: {
    backgroundColor: colors.surface,
    flex: 1,
  },
})

export function ReaderScreen() {
  const params = useLocalSearchParams<{ readingId: string }>()
  const runtimeState = useMobileRuntimeState()
  if (runtimeState.status !== 'ready') {
    const message = runtimeState.status === 'error' ? runtimeState.error.message : 'Opening Reader'
    return <SafeAreaView style={styles.root}><Text selectable style={styles.error}>{message}</Text></SafeAreaView>
  }
  try {
    const reading = runtimeState.runtime.readings.get(params.readingId)
    return (
      <SafeAreaView style={styles.root}>
        <GlassHeader
          leading={(
            <Pressable
              accessibilityLabel="Back to Shelf"
              hitSlop={8}
              style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
              onPress={router.back}
            >
              <Ionicons color={colors.text} name="chevron-back" size={22} />
            </Pressable>
          )}
          subtitle={reading.format.toUpperCase()}
          title={reading.name}
        />
        <View style={styles.surface}>
          <ReaderDomHost reading={reading} runtime={runtimeState.runtime} />
        </View>
      </SafeAreaView>
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return <SafeAreaView style={styles.root}><Text selectable style={styles.error}>{message}</Text></SafeAreaView>
  }
}
