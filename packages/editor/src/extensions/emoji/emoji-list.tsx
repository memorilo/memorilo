import type { EmojiItem } from '@tiptap/extension-emoji'
import type { SuggestionProps } from '@tiptap/suggestion'
import { cn } from '@memorilo/utils'
import { useImperativeHandle, useMemo, useRef, useState } from 'react'

export interface EmojiListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export interface EmojiListProps extends SuggestionProps<EmojiItem> {
  ref?: React.RefObject<EmojiListRef | null>
}

export function EmojiList({ ref, items, command }: EmojiListProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const prevItemsLengthRef = useRef(items.length)

  // Reset selection when items change, computed synchronously
  const effectiveIndex = useMemo(() => {
    if (prevItemsLengthRef.current !== items.length) {
      prevItemsLengthRef.current = items.length
      return 0
    }
    return Math.min(selectedIndex, Math.max(0, items.length - 1))
  }, [items.length, selectedIndex])

  const selectItem = (index: number) => {
    const item = items[index]
    if (item) {
      command(item)
    }
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex(prev => (prev + items.length - 1) % items.length)
        return true
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex(prev => (prev + 1) % items.length)
        return true
      }

      if (event.key === 'Enter') {
        selectItem(effectiveIndex)
        return true
      }

      return false
    },
  }))

  if (items.length === 0) {
    return null
  }

  return (
    <div className="bg-popover text-popover-foreground z-50 min-w-48 overflow-hidden rounded-md border p-1 shadow-md">
      {items.map((item, index) => (
        <button
          type="button"
          key={item.name}
          onClick={() => selectItem(index)}
          className={cn(
            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none',
            'hover:bg-accent hover:text-accent-foreground',
            index === effectiveIndex && 'bg-accent text-accent-foreground',
          )}
        >
          <span className="text-lg">{item.emoji}</span>
          <span className="flex-1 truncate text-left">
            :
            {item.name}
            :
          </span>
        </button>
      ))}
    </div>
  )
}

EmojiList.displayName = 'EmojiList'
