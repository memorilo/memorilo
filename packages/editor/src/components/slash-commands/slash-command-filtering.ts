import type { SlashCommandContext, SlashCommandItem, SlashCommandRegistry } from '../../lib/slash-commands/types'

export interface FilteredSlashCommands {
  groupTitles: string[]
  grouped: Map<string, SlashCommandItem[]>
  flat: SlashCommandItem[]
}

function normalizeQuery(query: string) {
  return query.trim().toLowerCase()
}

function commandMatches(command: SlashCommandItem, query: string) {
  const q = normalizeQuery(query)
  if (!q)
    return true

  const haystacks = [
    command.title,
    command.titleEn,
    command.description ?? '',
    command.id,
    ...(command.keywords ?? []),
  ].map(v => v.toLowerCase())

  return haystacks.some(value => value.includes(q))
}

export function mergeSlashCommandRegistries(base: SlashCommandRegistry, extra?: Partial<SlashCommandRegistry>): SlashCommandRegistry {
  return {
    groups: [...base.groups, ...(extra?.groups ?? [])],
    commands: [...base.commands, ...(extra?.commands ?? [])],
  }
}

export function filterSlashCommands(registry: SlashCommandRegistry, ctx: SlashCommandContext, query: string): FilteredSlashCommands {
  const visible = registry.commands.filter((command) => {
    if (command.hidden?.(ctx))
      return false
    return commandMatches(command, query)
  })

  const groupsById = new Map(registry.groups.map(g => [g.id, g]))
  const groupOrder = new Map<string, number>()
  for (const group of registry.groups) {
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
}

