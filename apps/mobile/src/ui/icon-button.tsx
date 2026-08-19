import type { ReactNode } from 'react'
import type { PressableProps, StyleProp, ViewStyle } from 'react-native'
import { Pressable, StyleSheet } from 'react-native'
import { colors } from './theme'

interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  variant?: 'plain' | 'control'
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.32,
  },
  pressed: {
    backgroundColor: colors.controlFillPressed,
    transform: [{ scale: 0.95 }],
  },
  root: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  control: {
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
  },
})

export function IconButton({ children, disabled, style, variant = 'plain', ...props }: IconButtonProps) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      hitSlop={props.hitSlop ?? 8}
      style={({ pressed }) => [
        styles.root,
        variant === 'control' && styles.control,
        style,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  )
}
