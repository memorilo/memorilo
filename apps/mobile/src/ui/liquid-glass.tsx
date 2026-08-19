import type { GlassViewProps } from 'expo-glass-effect'
import type { ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect'
import { useEffect, useState } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native'
import { useMobileAppearance } from '@/application/mobile-appearance-hook'
import { colors } from './theme'

export type LiquidGlassVariant = 'bar' | 'control' | 'surface'

const fallbackVariantStyles: Record<LiquidGlassVariant, ViewStyle> = {
  bar: {
    backgroundColor: colors.glassStrong,
    borderBottomColor: colors.glassBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  control: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
  surface: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  edgeLight: {
    borderTopColor: 'rgba(255, 255, 255, 0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  surface: {
    borderRadius: 18,
    shadowColor: '#24231F',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
})

export interface LiquidGlassProps extends Omit<GlassViewProps, 'style'> {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  variant?: LiquidGlassVariant
}

export function LiquidGlass({ children, style, variant = 'surface', ...props }: LiquidGlassProps) {
  const { preference: appearancePreference } = useMobileAppearance()
  const [reduceMotion, setReduceMotion] = useState(false)
  const [reduceTransparency, setReduceTransparency] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'ios')
      return
    let active = true
    void Promise.all([
      AccessibilityInfo.isReduceMotionEnabled(),
      AccessibilityInfo.isReduceTransparencyEnabled(),
    ]).then(([motion, transparency]) => {
      if (!active)
        return
      setReduceMotion(motion)
      setReduceTransparency(transparency)
    }).catch(() => undefined)
    // React Native returns explicit subscriptions for these accessibility observers.
    // eslint-disable-next-line react-web-api/no-leaked-event-listener
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    // eslint-disable-next-line react-web-api/no-leaked-event-listener
    const transparencySubscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency)
    return () => {
      active = false
      motionSubscription.remove()
      transparencySubscription.remove()
    }
  }, [])

  const glassAvailable = appearancePreference === 'automatic' && Platform.OS === 'ios' && isGlassEffectAPIAvailable() && !reduceTransparency

  if (!glassAvailable) {
    const {
      colorScheme: _colorScheme,
      glassEffectStyle: _glassEffectStyle,
      isInteractive: _isInteractive,
      tintColor: _tintColor,
      ...viewProps
    } = props
    return (
      <View {...viewProps} style={[fallbackVariantStyles[variant], styles.base, styles.edgeLight, style]}>
        {children}
      </View>
    )
  }

  return (
    <GlassView
      {...props}
      colorScheme={props.colorScheme ?? 'auto'}
      glassEffectStyle={props.glassEffectStyle ?? {
        animate: !reduceMotion,
        animationDuration: reduceMotion ? 0 : 0.24,
        style: 'regular',
      }}
      isInteractive={props.isInteractive ?? variant === 'control'}
      style={[styles.base, style]}
    >
      {children}
    </GlassView>
  )
}

export function GlassSurface({ children, style }: { children?: ReactNode, style?: StyleProp<ViewStyle> }) {
  return (
    <LiquidGlass style={[styles.surface, style]} variant="surface">
      {children}
    </LiquidGlass>
  )
}
