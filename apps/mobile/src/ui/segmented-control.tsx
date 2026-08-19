import type { StyleProp, ViewStyle } from 'react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, metrics } from './theme'

export interface SegmentedOption<Value extends string> {
  id: Value
  label: string
}

interface SegmentedControlProps<Value extends string> {
  accessibilityLabel?: string
  disabled?: boolean
  onChange: (value: Value) => void
  options: readonly SegmentedOption<Value>[]
  selected: Value
  style?: StyleProp<ViewStyle>
}

const styles = StyleSheet.create({
  option: {
    alignItems: 'center',
    borderRadius: metrics.cornerControl - 3,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 8,
  },
  optionPressed: {
    backgroundColor: colors.surfacePressed,
  },
  optionSelected: {
    backgroundColor: colors.surface,
    shadowColor: '#24231F',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  optionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  optionTextSelected: {
    color: colors.accent,
  },
  root: {
    alignSelf: 'stretch',
    backgroundColor: colors.backgroundRaised,
    borderRadius: metrics.cornerMedium,
    flexDirection: 'row',
    gap: 3,
    padding: 3,
  },
})

export function SegmentedControl<Value extends string>({
  accessibilityLabel,
  disabled = false,
  onChange,
  options,
  selected,
  style,
}: SegmentedControlProps<Value>) {
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="tablist" style={[styles.root, style]}>
      {options.map(option => (
        <Pressable
          key={option.id}
          accessibilityRole="tab"
          accessibilityState={{ disabled, selected: selected === option.id }}
          disabled={disabled}
          style={({ pressed }) => [
            styles.option,
            selected === option.id && styles.optionSelected,
            pressed && styles.optionPressed,
          ]}
          onPress={() => onChange(option.id)}
        >
          <Text style={[styles.optionText, selected === option.id && styles.optionTextSelected]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}
