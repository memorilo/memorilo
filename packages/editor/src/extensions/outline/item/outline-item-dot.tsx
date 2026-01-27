interface OutlineItemDotProps {
  isTaskItem: boolean
  isOrderedItem: boolean
  isChecked: boolean
  orderedIndex?: number | null
  checkboxLabel?: string
  onCheckboxChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

export function OutlineItemDot({
  isTaskItem,
  isOrderedItem,
  isChecked,
  orderedIndex,
  checkboxLabel,
  onCheckboxChange,
}: OutlineItemDotProps) {
  if (isTaskItem) {
    return (
      <label
        className="flex h-6 w-6 items-center justify-center"
        contentEditable={false}
        onMouseDown={e => e.preventDefault()}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={onCheckboxChange}
          className="h-4 w-4 cursor-pointer"
          aria-label={checkboxLabel}
        />
      </label>
    )
  }

  if (isOrderedItem) {
    return (
      <span
        className="font-mono text-gray-700 dark:text-gray-200"
        contentEditable={false}
        onMouseDown={e => e.preventDefault()}
      >
        {(orderedIndex ?? 1).toString()}
        .
      </span>
    )
  }

  return (
    <div
      className="h-1.5 w-1.5 rounded-full bg-black dark:bg-white"
      contentEditable={false}
      onMouseDown={e => e.preventDefault()}
    />
  )
}
