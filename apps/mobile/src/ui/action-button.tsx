import type { ReactNode } from 'react'
import type { PressableProps, StyleProp, ViewStyle } from 'react-native'
import { Pressable, StyleSheet, Text } from 'react-native'
import { colors, metrics } from './theme'

type ActionButtonTone = 'danger' | 'primary' | 'secondary'

interface ActionButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string
  leading?: ReactNode
  style?: StyleProp<ViewStyle>
  tone?: ActionButtonTone
}

const styles = StyleSheet.create({
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(179, 38, 30, 0.18)',
  },
  dangerLabel: {
    color: colors.danger,
  },
  dangerPressed: {
    backgroundColor: 'rgba(179, 38, 30, 0.16)',
  },
  disabled: {
    opacity: 0.42,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  primaryLabel: {
    color: colors.accentOn,
  },
  primaryPressed: {
    backgroundColor: colors.accentActive,
    borderColor: colors.accentActive,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  secondary: {
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
  },
  secondaryLabel: {
    color: colors.text,
  },
  secondaryPressed: {
    backgroundColor: colors.controlFillPressed,
  },
  root: {
    alignItems: 'center',
    borderRadius: metrics.cornerControl,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: metrics.touchTarget,
    paddingHorizontal: 16,
  },
})

export function ActionButton({
  disabled,
  label,
  leading,
  style,
  tone = 'secondary',
  ...props
}: ActionButtonProps) {
  return (
    <Pressable
      {...props}
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      disabled={disabled}
      style={({ pressed }) => [
        styles.root,
        styles[tone],
        style,
        disabled && styles.disabled,
        pressed && styles.pressed,
        pressed && tone === 'primary' && styles.primaryPressed,
        pressed && tone === 'secondary' && styles.secondaryPressed,
        pressed && tone === 'danger' && styles.dangerPressed,
      ]}
    >
      {leading}
      <Text
        style={[
          styles.label,
          tone === 'primary' && styles.primaryLabel,
          tone === 'secondary' && styles.secondaryLabel,
          tone === 'danger' && styles.dangerLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}
