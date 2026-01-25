import type { SuggestionProps } from '@tiptap/suggestion'
import type { SlashCommand } from './slash-types'
import { cn } from '@memorilo/utils'
import { groupBy } from 'es-toolkit'
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { slashCommandGroups } from './slash-items'

export interface SlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export interface SlashMenuProps extends SuggestionProps<SlashCommand> {
  ref?: React.RefObject<SlashMenuRef | null>
}

interface GroupedCommand {
  group: string
  items: Array<{
    item: SlashCommand
    index: number
  }>
}

function getGroupedCommands(items: SlashCommand[]): GroupedCommand[] {
  const indexedItems = items.map((item, index) => ({ item, index }))
  const grouped = groupBy(indexedItems, entry => entry.item.group)

  return slashCommandGroups.flatMap((group) => {
    const entries = grouped[group.id]
    if (!entries || entries.length === 0) {
      return []
    }
    return [
      {
        group: group.label,
        items: entries,
      },
    ]
  })
}

export function SlashMenu({ ref, items, command }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const prevItemsLengthRef = useRef(items.length)
  const listRef = useRef<HTMLDivElement | null>(null)

  const effectiveIndex = useMemo(() => {
    if (prevItemsLengthRef.current !== items.length) {
      prevItemsLengthRef.current = items.length
      return 0
    }
    return Math.min(selectedIndex, Math.max(0, items.length - 1))
  }, [items.length, selectedIndex])

  const groupedCommands = useMemo(() => getGroupedCommands(items), [items])

  const selectItem = (index: number) => {
    const item = items[index]
    if (item) {
      command(item)
    }
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) {
        return false
      }

      if (event.key === 'ArrowUp' || event.key === 'Up') {
        event.preventDefault()
        event.stopPropagation()
        setSelectedIndex(prev => (prev + items.length - 1) % items.length)
        return true
      }

      if (event.key === 'ArrowDown' || event.key === 'Down') {
        event.preventDefault()
        event.stopPropagation()
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

  useEffect(() => {
    if (!listRef.current || items.length === 0) {
      return
    }

    const activeItem = listRef.current.querySelector<HTMLElement>(
      `[data-slash-index="${effectiveIndex}"]`,
    )
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [effectiveIndex, items.length])

  return (
    <div className="bg-popover text-popover-foreground w-80 overflow-hidden rounded-md border shadow-md">
      <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
        {items.length === 0
          ? (
              <div className="text-muted-foreground px-3 py-2 text-xs">
                No matches found.
              </div>
            )
          : (
              groupedCommands.map((group, groupIndex) => (
                <div
                  key={group.group}
                  className={cn(groupIndex > 0 && 'border-t border-border/70 pt-1')}
                >
                  <div className="text-muted-foreground px-3 py-1 text-[11px] uppercase">
                    {group.group}
                  </div>
                  <div className="px-1">
                    {group.items.map(({ item, index }) => {
                      const Icon = item.icon
                      return (
                        <button
                          type="button"
                          key={item.id}
                          data-slash-index={index}
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => selectItem(index)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                            'hover:bg-accent hover:text-accent-foreground',
                            index === effectiveIndex && 'bg-accent text-accent-foreground',
                          )}
                        >
                          {Icon ? <Icon className="text-muted-foreground size-4" /> : null}
                          <div className="flex-1">
                            <div className="leading-5">{item.title}</div>
                            {item.description
                              ? (
                                  <div className="text-muted-foreground text-xs">
                                    {item.description}
                                  </div>
                                )
                              : null}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
      </div>
    </div>
  )
}

SlashMenu.displayName = 'SlashMenu'
