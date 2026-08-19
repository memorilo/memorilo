import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, metrics } from './theme'

interface EmptyStateProps {
  description?: string
  icon: ReactNode
  title: string
}

const styles = StyleSheet.create({
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 320,
    textAlign: 'center',
  },
  icon: {
    alignItems: 'center',
    backgroundColor: colors.accentSoft,
    borderRadius: metrics.cornerMedium,
    height: 58,
    justifyContent: 'center',
    marginBottom: 4,
    width: 58,
  },
  root: {
    alignItems: 'center',
    gap: 10,
    maxWidth: 360,
    paddingHorizontal: 28,
    paddingVertical: 30,
    width: '100%',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
})

export function EmptyState({ description, icon, title }: EmptyStateProps) {
  return (
    <View style={styles.root}>
      <View style={styles.icon}>{icon}</View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  )
}
