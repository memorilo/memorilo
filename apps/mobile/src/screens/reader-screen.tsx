import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { ReaderDomHost } from '@/surfaces/reader-dom-host'
import { GlassHeader } from '@/ui/glass-header'
import { IconButton } from '@/ui/icon-button'
import { colors } from '@/ui/theme'

const styles = StyleSheet.create({
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
  const { t } = useTranslation('app')
  const params = useLocalSearchParams<{ readingId: string }>()
  const runtimeState = useMobileRuntimeState()
  if (runtimeState.status !== 'ready') {
    const message = runtimeState.status === 'error' ? runtimeState.error.message : t('mobileOpeningReader')
    return <SafeAreaView style={styles.root}><Text selectable style={styles.error}>{message}</Text></SafeAreaView>
  }
  try {
    const reading = runtimeState.runtime.readings.get(params.readingId)
    return (
      <SafeAreaView style={styles.root}>
        <GlassHeader
          leading={(
            <IconButton
              accessibilityLabel={t('shelfBackToShelf')}
              onPress={router.back}
            >
              <Ionicons color={colors.text} name="chevron-back" size={22} />
            </IconButton>
          )}
          subtitle={reading.format.toUpperCase()}
          title={reading.name}
        />
        <View style={styles.surface}>
          <ReaderDomHost
            reading={reading}
            runtime={runtimeState.runtime}
            onOpenTopic={({ noteId, topicId }) => {
              router.push({
                params: { noteId, topicId },
                pathname: '/(tabs)/notes',
              })
            }}
          />
        </View>
      </SafeAreaView>
    )
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return <SafeAreaView style={styles.root}><Text selectable style={styles.error}>{message}</Text></SafeAreaView>
  }
}
