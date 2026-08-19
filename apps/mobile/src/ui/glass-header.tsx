import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { StyleSheet, Text, View } from 'react-native'
import { LiquidGlass } from './liquid-glass'
import { colors, metrics } from './theme'

interface GlassHeaderProps {
  leading?: ReactNode
  subtitle?: string
  title: string
  trailing?: ReactNode
  style?: StyleProp<ViewStyle>
}

const styles = StyleSheet.create({
  actionGroup: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    minHeight: metrics.touchTarget,
    paddingHorizontal: 1,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 64,
    paddingHorizontal: metrics.horizontalInset,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  root: {
    marginTop: 4,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  title: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '700',
    lineHeight: 32,
  },
  trailing: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
})

export function GlassHeader({ leading, subtitle, title, trailing, style }: GlassHeaderProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.content}>
        {leading
          ? <LiquidGlass style={styles.actionGroup} variant="control">{leading}</LiquidGlass>
          : null}
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {trailing
          ? (
              <LiquidGlass style={styles.actionGroup} variant="control">
                <View style={styles.trailing}>{trailing}</View>
              </LiquidGlass>
            )
          : null}
      </View>
    </View>
  )
}
