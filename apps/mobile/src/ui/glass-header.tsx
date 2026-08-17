import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { StyleSheet, Text, View } from 'react-native'
import { LiquidGlass } from './liquid-glass'
import { colors } from './theme'

interface GlassHeaderProps {
  leading?: ReactNode
  subtitle?: string
  title: string
  trailing?: ReactNode
  style?: StyleProp<ViewStyle>
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 66,
    paddingHorizontal: 16,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  root: {
    borderRadius: 24,
    marginHorizontal: 12,
    marginTop: 8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  title: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 28,
  },
  trailing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
})

export function GlassHeader({ leading, subtitle, title, trailing, style }: GlassHeaderProps) {
  return (
    <LiquidGlass style={[styles.root, style]} variant="bar">
      <View style={styles.content}>
        {leading}
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </LiquidGlass>
  )
}
