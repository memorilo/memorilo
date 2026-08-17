import { useCallback, useState } from 'react'

export function useControllableState<T>({
  defaultValue,
  onValueChange,
  value,
}: {
  defaultValue: T
  onValueChange?: (value: T) => void
  value?: T
}): readonly [T, (value: T) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const controlled = value !== undefined
  const currentValue = controlled ? value : uncontrolledValue
  const setValue = useCallback((nextValue: T) => {
    if (!controlled)
      setUncontrolledValue(nextValue)
    if (!Object.is(nextValue, currentValue))
      onValueChange?.(nextValue)
  }, [controlled, currentValue, onValueChange])
  return [currentValue, setValue]
}
