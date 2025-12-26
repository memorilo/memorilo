import type { RefObject } from 'react'
import type { SlashCommandItem } from '../../lib/slash-commands/types'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@memorilo/components/ui/command'
import { cn } from '@memorilo/utils'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t, i18n } = useTranslation('app')
  const tEn = useMemo(() => i18n.getFixedT('en', 'app'), [i18n])
  const resolvedLanguage = i18n.resolvedLanguage ?? i18n.language
  const tKey = (key: string) => t(key as any, { defaultValue: key }) as string
  const tEnKey = (key: string) => tEn(key as any, { defaultValue: key }) as string
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
          <CommandEmpty>{t('editor.slashCommands.empty')}</CommandEmpty>
          {groupTitles.map((title, index) => {
            const groupItems = grouped.get(title) ?? []
            if (groupItems.length === 0)
              return null

            return (
              <div key={title}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup heading={tKey(title)}>
                  {groupItems.map((command) => {
                    const state = itemStateById.get(command.id) ?? { command, disabled: false }
                    const descriptionKey = state.disabledReason ?? command.description
                    const titleCurrent = tKey(command.title)
                    const titleEnglish = tEnKey(command.title)
                    const showEnglishSubtitle = resolvedLanguage !== 'en' && titleEnglish !== titleCurrent
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
                              {titleCurrent}
                              {showEnglishSubtitle && (
                                <span className="text-muted-foreground">
                                  {' '}
                                  (
                                  {titleEnglish}
                                  )
                                </span>
                              )}
                            </span>
                          </div>
                          {descriptionKey && (
                            <div className="text-xs text-muted-foreground truncate">
                              {tKey(descriptionKey)}
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
