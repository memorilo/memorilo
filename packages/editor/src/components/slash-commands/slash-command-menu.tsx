import type { RefObject } from 'react'
import type { SlashCommandContext, SlashCommandItem } from '../../lib/slash-commands/types'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@memorilo/components/ui/command'
import { cn } from '@memorilo/utils'
import { useMemo } from 'react'
import { getEditorMaxWidthPx } from '../../lib/dom'

export interface SlashCommandItemState {
  command: SlashCommandItem
  disabled: boolean
  disabledReason?: string
}

export interface SlashCommandMenuProps {
  open: boolean
  position: { top: number, left: number } | null
  rootRef: RefObject<HTMLDivElement | null>
  ctx: SlashCommandContext
  groupTitles: string[]
  grouped: Map<string, SlashCommandItem[]>
  itemStateById: Map<string, SlashCommandItemState>
  selectedId: string | null
  onSelectedIdChange: (id: string) => void
  onSelectCommand: (command: SlashCommandItem) => void
}

export function SlashCommandMenu({
  open,
  position,
  rootRef,
  groupTitles,
  grouped,
  itemStateById,
  selectedId,
  onSelectedIdChange,
  onSelectCommand,
}: SlashCommandMenuProps) {
  const maxWidthPx = useMemo(() => {
    const activeEl = typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null
    return getEditorMaxWidthPx(activeEl)
  }, [])

  if (!open || !position)
    return null

  return (
    <div
      ref={rootRef}
      className={cn(
        'fixed z-50 rounded-lg border bg-popover text-popover-foreground shadow-lg',
        'overflow-hidden',
      )}
      style={{
        top: position.top,
        left: position.left,
        width: 'min(420px, calc(100vw - 16px))',
        maxWidth: maxWidthPx ? `min(${maxWidthPx}px, calc(100vw - 16px))` : undefined,
      }}
      onMouseDown={(e) => {
        // Keep editor focused while interacting with the menu.
        e.preventDefault()
      }}
    >
      <Command
        value={selectedId ?? undefined}
        onValueChange={onSelectedIdChange}
        shouldFilter={false}
        className="rounded-none"
      >
        <CommandList className="max-h-[min(360px,calc(100vh-120px))]">
          <CommandEmpty>没有匹配的命令</CommandEmpty>
          {groupTitles.map((title, index) => {
            const groupItems = grouped.get(title) ?? []
            if (groupItems.length === 0)
              return null

            return (
              <div key={title}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={title}>
                  {groupItems.map((command) => {
                    const state = itemStateById.get(command.id) ?? { command, disabled: false }
                    return (
                      <CommandItem
                        key={command.id}
                        value={command.id}
                        disabled={state.disabled}
                        onMouseEnter={() => onSelectedIdChange(command.id)}
                        onSelect={() => onSelectCommand(command)}
                      >
                        {command.icon && (
                          <span className="flex items-center justify-center shrink-0 w-4">
                            {command.icon}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">
                              {command.title}
                              <span className="text-muted-foreground">
                                {' '}
                                (
                                {command.titleEn}
                                )
                              </span>
                            </span>
                          </div>
                          {(state.disabledReason || command.description) && (
                            <div className="text-xs text-muted-foreground truncate">
                              {state.disabledReason ?? command.description}
                            </div>
                          )}
                        </span>
                        {command.shortcut && (
                          <CommandShortcut>{command.shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </div>
            )
          })}
        </CommandList>
      </Command>
    </div>
  )
}
