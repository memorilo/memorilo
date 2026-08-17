import type { MobileSurfaceKind, SurfaceToHostMessage } from '@/surfaces/bridge-contract'
import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useMobileRuntimeState } from '@/application/mobile-runtime-state'
import { SurfaceWebView } from '@/surfaces/surface-web-view'
import { GlassHeader } from '@/ui/glass-header'
import { colors } from '@/ui/theme'

export interface WorkspaceScreenProps {
  kind: 'shelf'
  title: string
}

const surfaceByWorkspace: Record<WorkspaceScreenProps['kind'], MobileSurfaceKind> = {
  shelf: 'reader',
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
  errorMark: {
    backgroundColor: colors.danger,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  errorMessage: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 420,
    textAlign: 'center',
  },
  errorTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  inlineError: {
    color: colors.danger,
    fontSize: 14,
    padding: 18,
  },
  readyIndicator: {
    backgroundColor: colors.accent,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
  status: {
    color: colors.muted,
    fontSize: 14,
  },
  surface: {
    flex: 1,
  },
})

export function WorkspaceScreen({ kind, title }: WorkspaceScreenProps) {
  const runtimeState = useMobileRuntimeState()
  const [surfaceError, setSurfaceError] = useState<string | null>(null)
  const onSurfaceMessage = useCallback((message: SurfaceToHostMessage) => {
    if (message.type === 'surface.error')
      setSurfaceError(message.error)
  }, [])

  if (runtimeState.status === 'loading') {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.status}>Opening local database</Text>
      </SafeAreaView>
    )
  }

  if (runtimeState.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <View style={styles.errorMark} />
        <Text style={styles.errorTitle}>Startup failed</Text>
        <Text selectable style={styles.errorMessage}>{runtimeState.error.message}</Text>
      </SafeAreaView>
    )
  }

  const databaseLabel = `SQLite driver · generation ${runtimeState.runtime.databaseGeneration}`

  return (
    <SafeAreaView style={styles.root}>
      <GlassHeader
        subtitle={databaseLabel}
        title={title}
        trailing={<View accessibilityLabel="Native storage ready" style={styles.readyIndicator} />}
      />
      {surfaceError
        ? <Text selectable style={styles.inlineError}>{surfaceError}</Text>
        : (
            <View style={styles.surface}>
              <SurfaceWebView onMessage={onSurfaceMessage} surface={surfaceByWorkspace[kind]} />
            </View>
          )}
    </SafeAreaView>
  )
}
