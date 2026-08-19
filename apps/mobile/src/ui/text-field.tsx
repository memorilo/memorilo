import type { ReactNode } from 'react'
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native'
import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import { colors, metrics } from './theme'

interface TextFieldProps extends TextInputProps {
  containerStyle?: StyleProp<ViewStyle>
  leading?: ReactNode
}

const styles = StyleSheet.create({
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 13,
  },
  root: {
    backgroundColor: colors.controlFill,
    borderColor: colors.controlStroke,
    borderRadius: metrics.cornerControl,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    minHeight: 46,
  },
  focused: {
    borderColor: colors.accent,
    borderWidth: 1,
  },
})

export function TextField({ containerStyle, leading, style, ...props }: TextFieldProps) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={[styles.root, focused && styles.focused, containerStyle]}>
      <View style={styles.inputRow}>
        {leading}
        <TextInput
          {...props}
          placeholderTextColor={props.placeholderTextColor ?? colors.muted}
          style={[styles.input, style]}
          onBlur={(event) => {
            setFocused(false)
            props.onBlur?.(event)
          }}
          onFocus={(event) => {
            setFocused(true)
            props.onFocus?.(event)
          }}
        />
      </View>
    </View>
  )
}
