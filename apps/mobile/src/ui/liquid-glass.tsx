import type { GlassViewProps } from 'expo-glass-effect'
import type { ReactNode } from 'react'
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native'
import { GlassView } from 'expo-glass-effect'
import { StyleSheet, TextInput } from 'react-native'
import { colors } from './theme'

export type LiquidGlassVariant = 'bar' | 'control' | 'surface'

const variantStyles: Record<LiquidGlassVariant, ViewStyle> = {
  bar: {
    backgroundColor: colors.glass,
    borderBottomColor: colors.glassBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  control: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.glassBorder,
    borderWidth: StyleSheet.hairlineWidth,
  },
  surface: {
    backgroundColor: colors.glass,
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
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputShell: {
    borderRadius: 15,
    marginHorizontal: 16,
    minHeight: 46,
  },
  surface: {
    borderRadius: 22,
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
  return (
    <GlassView
      {...props}
      colorScheme="auto"
      glassEffectStyle="regular"
      style={[styles.base, variantStyles[variant], styles.edgeLight, style]}
    >
      {children}
    </GlassView>
  )
}

export function LiquidGlassInput({ containerStyle, style, ...props }: TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>
}) {
  return (
    <LiquidGlass style={[styles.inputShell, containerStyle]} variant="control">
      <TextInput
        {...props}
        placeholderTextColor={props.placeholderTextColor ?? colors.muted}
        style={[styles.input, style]}
      />
    </LiquidGlass>
  )
}

export function GlassSurface({ children, style }: { children?: ReactNode, style?: StyleProp<ViewStyle> }) {
  return (
    <LiquidGlass style={[styles.surface, style]} variant="surface">
      {children}
    </LiquidGlass>
  )
}
