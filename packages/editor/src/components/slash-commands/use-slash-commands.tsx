import type { KeyboardEvent } from 'react'
import type { SlashCommandContext, SlashCommandItem, SlashCommandRegistry } from '../../lib/slash-commands/types'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandSeparator, CommandShortcut } from '@memorilo/components/ui/command'
import { cn } from '@memorilo/utils'
import { useCallback, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Editor } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { getEditorMaxWidthPx } from '../../lib/dom'
import { deleteSlashTrigger } from '../../lib/slash-commands/transforms'
import { getSlashTrigger } from '../../lib/slash-commands/trigger'

function normalizeQuery(query: string) {
  return query.trim().toLowerCase()
}

function commandMatches(command: SlashCommandItem, query: string) {
  const q = normalizeQuery(query)
  if (!q)
    return true

  /**
   * Match against user-facing metadata so users can search by:
   * - i10n name
   * - English name
   * - description
   * - keywords / ids
   */
  const haystacks = [
    command.title,
    command.titleEn,
    command.description ?? '',
    command.id,
    ...(command.keywords ?? []),
  ].map(v => v.toLowerCase())

  return haystacks.some(value => value.includes(q))
}

function getCaretRect(editor: ReactEditor) {
  /**
   * Read the caret rectangle from the DOM selection.
   * Used to position the floating command menu near the user's typing location.
   */
  try {
    if (!editor.selection)
      return null

    const domRange = ReactEditor.toDOMRange(editor, editor.selection)
    const rect = domRange.getBoundingClientRect()
    if (rect && (rect.width || rect.height))
      return rect

    const clientRects = domRange.getClientRects()
    return clientRects[0] ?? rect
  }
  catch {
    return null
  }
}

function mergeRegistries(base: SlashCommandRegistry, extra?: Partial<SlashCommandRegistry>): SlashCommandRegistry {
  return {
    groups: [...base.groups, ...(extra?.groups ?? [])],
    commands: [...base.commands, ...(extra?.commands ?? [])],
  }
}

export interface UseSlashCommandsOptions {
  registry: SlashCommandRegistry
  extraRegistry?: Partial<SlashCommandRegistry>
}

export function useSlashCommands({ registry, extraRegistry }: UseSlashCommandsOptions) {
  const editor = useSlateStatic()
  const trigger = useSlateSelector(editor => getSlashTrigger(editor))

  const mergedRegistry = useMemo(() => mergeRegistries(registry, extraRegistry), [registry, extraRegistry])

  /**
   * When the user presses `Esc`, dismiss the palette for the current trigger location.
   * We intentionally keep the typed trigger text in the editor.
   */
  const dismissedKeyRef = useRef<string | null>(null)
  const forceRender = useReducer(x => x + 1, 0)[1]

  // Reset dismissal once the trigger disappears, so re-typing can open the palette again.
  useLayoutEffect(() => {
    if (!trigger) {
      dismissedKeyRef.current = null
    }
  }, [trigger])

  const open = !!trigger && trigger.key !== dismissedKeyRef.current

  const ctx: SlashCommandContext = useMemo(() => ({ editor }), [editor])

  const filtered = useMemo(() => {
    const visible = mergedRegistry.commands.filter((command) => {
      if (command.hidden?.(ctx))
        return false
      return commandMatches(command, trigger?.query ?? '')
    })

    const groupsById = new Map(mergedRegistry.groups.map(g => [g.id, g]))
    const groupOrder = new Map<string, number>()
    for (const group of mergedRegistry.groups) {
      groupOrder.set(group.id, group.order)
      groupOrder.set(group.title, group.order)
    }

    const grouped = new Map<string, SlashCommandItem[]>()
    for (const command of visible) {
      const groupTitle = groupsById.get(command.group)?.title ?? command.group
      if (!grouped.has(groupTitle))
        grouped.set(groupTitle, [])
      grouped.get(groupTitle)!.push(command)
    }

    const groupTitles = Array.from(grouped.keys()).sort((a, b) => {
      const orderA = groupOrder.get(a) ?? 1000
      const orderB = groupOrder.get(b) ?? 1000
      return orderA - orderB || a.localeCompare(b)
    })

    const flat = groupTitles.flatMap(title => grouped.get(title) ?? [])
    return { groupTitles, grouped, flat }
  }, [ctx, mergedRegistry.commands, mergedRegistry.groups, trigger?.query])

  /**
   * Precompute availability for stable rendering + keyboard navigation.
   */
  const items = useMemo(() => {
    return filtered.flat.map((command) => {
      const disabled = command.disabled?.(ctx) ?? false
      const disabledReason = disabled ? (command.disabledReason?.(ctx) ?? undefined) : undefined
      return { command, disabled, disabledReason }
    })
  }, [ctx, filtered.flat])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  /**
   * Keep selection purely event-driven:
   * - keyboard navigation updates {@link selectedId}
   * - mouse hover/click updates {@link selectedId}
   *
   * When filtering changes and the previously selected item no longer exists,
   * we fall back to the first available command for display without syncing state.
   */
  const allCommandIds = useMemo(() => filtered.flat.map(cmd => cmd.id), [filtered.flat])
  const enabledCommandIds = useMemo(
    () => items.filter(item => !item.disabled).map(item => item.command.id),
    [items],
  )
  const displaySelectedId = useMemo(() => {
    if (!open)
      return null

    if (selectedId && allCommandIds.includes(selectedId))
      return selectedId

    return enabledCommandIds[0] ?? allCommandIds[0] ?? null
  }, [allCommandIds, enabledCommandIds, open, selectedId])

  const selectedCommand = useMemo(() => {
    if (!displaySelectedId)
      return null
    return items.find(item => item.command.id === displaySelectedId)?.command ?? null
  }, [displaySelectedId, items])

  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number, left: number } | null>(null)

  /**
   * Ensure the currently selected command item stays visible when navigating
   * with keyboard (ArrowUp/ArrowDown/Cmd+J/Cmd+K).
   */
  const scrollSelectedIntoView = useCallback(() => {
    const root = menuRef.current
    if (!root)
      return

    const list = root.querySelector('[data-slot="command-list"]') as HTMLElement | null
    const selected = root.querySelector('[data-slot="command-item"][data-selected="true"]') as HTMLElement | null
    if (!list || !selected)
      return

    const padding = 8
    const itemTop = selected.offsetTop
    const itemBottom = itemTop + selected.offsetHeight
    const viewTop = list.scrollTop
    const viewBottom = viewTop + list.clientHeight

    if (itemTop - padding < viewTop) {
      list.scrollTop = Math.max(0, itemTop - padding)
    }
    else if (itemBottom + padding > viewBottom) {
      list.scrollTop = itemBottom + padding - list.clientHeight
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }

    const caretRect = getCaretRect(editor)
    if (!caretRect) {
      setPosition(null)
      return
    }

    setPosition({ top: caretRect.bottom + 8, left: caretRect.left })
  }, [editor, open, trigger?.key])

  useLayoutEffect(() => {
    if (!open)
      return

    // Wait one frame so cmdk applies `data-selected="true"` to the DOM node.
    const raf = requestAnimationFrame(scrollSelectedIntoView)
    return () => cancelAnimationFrame(raf)
  }, [displaySelectedId, filtered.groupTitles.length, items.length, open, scrollSelectedIntoView])

  const reposition = useCallback(() => {
    if (!open)
      return

    const caretRect = getCaretRect(editor)
    const el = menuRef.current
    if (!caretRect || !el)
      return

    /**
     * Clamp the menu into the viewport so it never overflows off-screen.
     * When bottom space is insufficient, flip the menu above the caret.
     */
    const panelRect = el.getBoundingClientRect()
    const viewportPad = 8

    let left = caretRect.left
    let top = caretRect.bottom + 8

    if (left + panelRect.width > window.innerWidth - viewportPad) {
      left = window.innerWidth - viewportPad - panelRect.width
    }
    if (left < viewportPad)
      left = viewportPad

    if (top + panelRect.height > window.innerHeight - viewportPad) {
      top = caretRect.top - 8 - panelRect.height
    }
    if (top < viewportPad)
      top = viewportPad

    setPosition(prev => (prev && prev.top === top && prev.left === left) ? prev : { top, left })
  }, [editor, open])

  useLayoutEffect(() => {
    if (!open)
      return

    const raf = requestAnimationFrame(reposition)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, reposition, trigger?.key, trigger?.query, filtered.flat.length])

  const applyCommand = useCallback((command: SlashCommandItem) => {
    if (!trigger)
      return

    const disabled = command.disabled?.(ctx) ?? false
    if (disabled)
      return

    Editor.withoutNormalizing(editor, () => {
      deleteSlashTrigger(editor, trigger.range)
      command.run(ctx)
    })

    dismissedKeyRef.current = null
    ReactEditor.focus(editor)
  }, [ctx, editor, trigger])

  /**
   * Keyboard navigation always skips disabled commands.
   */
  const moveSelection = useCallback((delta: 1 | -1) => {
    if (enabledCommandIds.length === 0)
      return

    const currentIndex = displaySelectedId ? enabledCommandIds.indexOf(displaySelectedId) : -1
    const nextIndex = (currentIndex + delta + enabledCommandIds.length) % enabledCommandIds.length
    setSelectedId(enabledCommandIds[nextIndex])
  }, [displaySelectedId, enabledCommandIds])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!open)
      return false

    if (event.key === 'Escape') {
      event.preventDefault()
      dismissedKeyRef.current = trigger?.key ?? null
      forceRender()
      return true
    }

    const isMetaJ = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j'
    const isMetaK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
    const isArrowDown = event.key === 'ArrowDown'
    const isArrowUp = event.key === 'ArrowUp'

    if (isArrowDown || isMetaJ) {
      event.preventDefault()
      moveSelection(1)
      return true
    }

    if (isArrowUp || isMetaK) {
      event.preventDefault()
      moveSelection(-1)
      return true
    }

    if (event.key === 'Enter') {
      if (!selectedCommand)
        return false

      event.preventDefault()
      applyCommand(selectedCommand)
      return true
    }

    return false
  }, [applyCommand, forceRender, moveSelection, open, selectedCommand, trigger?.key])

  const menu = useMemo(() => {
    if (!open || !position)
      return null

    const activeEl = typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null
    const maxWidthPx = getEditorMaxWidthPx(activeEl)

    return (
      <div
        ref={menuRef}
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
          value={displaySelectedId ?? undefined}
          onValueChange={(value) => {
            setSelectedId(value)
          }}
          shouldFilter={false}
          className="rounded-none"
        >
          <CommandList className="max-h-[min(360px,calc(100vh-120px))]">
            <CommandEmpty>没有匹配的命令</CommandEmpty>
            {filtered.groupTitles.map((title, index) => {
              const groupItems = filtered.grouped.get(title) ?? []
              if (groupItems.length === 0)
                return null

              return (
                <div key={title}>
                  {index > 0 && <CommandSeparator />}
                  <CommandGroup heading={title}>
                    {groupItems.map((command) => {
                      const disabled = command.disabled?.(ctx) ?? false
                      const disabledReason = disabled ? (command.disabledReason?.(ctx) ?? undefined) : undefined
                      return (
                        <CommandItem
                          key={command.id}
                          value={command.id}
                          disabled={disabled}
                          onMouseEnter={() => setSelectedId(command.id)}
                          onSelect={() => applyCommand(command)}
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
                            {(disabledReason || command.description) && (
                              <div className="text-xs text-muted-foreground truncate">
                                {disabledReason ?? command.description}
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
  }, [applyCommand, ctx, displaySelectedId, filtered.groupTitles, filtered.grouped, open, position])

  return { open, onKeyDown, menu, query: trigger?.query ?? '' }
}
