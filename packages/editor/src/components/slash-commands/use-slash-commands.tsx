import type { KeyboardEvent } from 'react'
import type { SlashCommandContext, SlashCommandItem, SlashCommandRegistry } from '../../lib/slash-commands/types'
import { useCallback, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Editor } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { deleteSlashTrigger } from '../../lib/slash-commands/transforms'
import { getSlashTrigger } from '../../lib/slash-commands/trigger'
import { groupSlashCommands, mergeSlashCommandRegistries } from './slash-command-grouping'
import { SlashCommandMenu } from './slash-command-menu'
import { useSlashCommandMenuPosition } from './use-slash-command-menu-position'

export interface UseSlashCommandsOptions {
  registry: SlashCommandRegistry
  extraRegistry?: Partial<SlashCommandRegistry>
}

export function useSlashCommands({ registry, extraRegistry }: UseSlashCommandsOptions) {
  const editor = useSlateStatic()
  const { t, i18n } = useTranslation('app')
  const trigger = useSlateSelector(editor => getSlashTrigger(editor))

  const mergedRegistry = useMemo(
    () => mergeSlashCommandRegistries(registry, extraRegistry),
    [registry, extraRegistry],
  )

  const dismissedKeyRef = useRef<string | null>(null)
  const forceRender = useReducer(x => x + 1, 0)[1]

  useLayoutEffect(() => {
    if (!trigger) {
      dismissedKeyRef.current = null
    }
  }, [trigger])

  const open = !!trigger && trigger.key !== dismissedKeyRef.current
  const ctx: SlashCommandContext = useMemo(() => ({ editor }), [editor])

  const tEn = useMemo(() => i18n.getFixedT('en', 'app'), [i18n])
  const tKey = useCallback((key: string) => t(key as any, { defaultValue: key }) as string, [t])
  const tEnKey = useCallback((key: string) => tEn(key as any, { defaultValue: key }) as string, [tEn])
  const filtered = useMemo(() => {
    const q = (trigger?.query ?? '').trim().toLowerCase()
    const visible = mergedRegistry.commands.filter((command) => {
      if (command.hidden?.(ctx))
        return false
      if (!q)
        return true

      const titleCurrent = tKey(command.title)
      const titleEnglish = tEnKey(command.title)
      const descriptionKey = command.description
      const descriptionCurrent = descriptionKey ? tKey(descriptionKey) : ''
      const descriptionEnglish = descriptionKey ? tEnKey(descriptionKey) : ''

      const haystacks = [
        command.title,
        titleCurrent,
        titleEnglish,
        command.description ?? '',
        descriptionCurrent,
        descriptionEnglish,
        command.id,
      ].map(v => String(v).toLowerCase())

      return haystacks.some(value => value.includes(q))
    })

    return groupSlashCommands(mergedRegistry, visible)
  }, [ctx, mergedRegistry, tEnKey, tKey, trigger?.query])

  const items = useMemo(() => {
    return filtered.flat.map((command) => {
      const disabled = command.disabled?.(ctx) ?? false
      const disabledReason = disabled ? (command.disabledReason?.(ctx) ?? undefined) : undefined
      return { command, disabled, disabledReason }
    })
  }, [ctx, filtered.flat])

  const itemStateById = useMemo(() => {
    return new Map(items.map(item => [item.command.id, item]))
  }, [items])

  const [selectedId, setSelectedId] = useState<string | null>(null)

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
    return itemStateById.get(displaySelectedId)?.command ?? null
  }, [displaySelectedId, itemStateById])

  const { menuRef, position } = useSlashCommandMenuPosition({
    open,
    editor,
    triggerKey: trigger?.key,
    triggerQuery: trigger?.query,
    displaySelectedId,
    groupCount: filtered.groupTitles.length,
    itemCount: items.length,
    flatCount: filtered.flat.length,
  })

  const applyCommand = useCallback((command: SlashCommandItem) => {
    if (!trigger)
      return

    if (itemStateById.get(command.id)?.disabled)
      return

    Editor.withoutNormalizing(editor, () => {
      deleteSlashTrigger(editor, trigger.range)
      command.run(ctx)
    })

    dismissedKeyRef.current = null
    ReactEditor.focus(editor)
  }, [ctx, editor, itemStateById, trigger])

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
    return (
      <SlashCommandMenu
        open={open}
        position={position}
        rootRef={menuRef}
        groupTitles={filtered.groupTitles}
        grouped={filtered.grouped}
        itemStateById={itemStateById}
        selectedId={displaySelectedId}
        onSelectedIdChange={(id) => {
          setSelectedId(id)
        }}
        onSelectCommand={applyCommand}
      />
    )
  }, [applyCommand, displaySelectedId, filtered.groupTitles, filtered.grouped, itemStateById, open, position, menuRef])

  return {
    open,
    onKeyDown,
    menu,
    query: trigger?.query ?? '',
    triggerRange: open ? (trigger?.range ?? null) : null,
  }
}
