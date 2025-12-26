import type { SlashCommandItem, SlashCommandRegistry } from '../../lib/slash-commands/types'

export interface FilteredSlashCommands {
  groupTitles: string[]
  grouped: Map<string, SlashCommandItem[]>
  flat: SlashCommandItem[]
}

export function mergeSlashCommandRegistries(base: SlashCommandRegistry, extra?: Partial<SlashCommandRegistry>): SlashCommandRegistry {
  return {
    groups: [...base.groups, ...(extra?.groups ?? [])],
    commands: [...base.commands, ...(extra?.commands ?? [])],
  }
}

export function groupSlashCommands(registry: SlashCommandRegistry, commands: SlashCommandItem[]): FilteredSlashCommands {
  const groupsById = new Map(registry.groups.map(g => [g.id, g]))
  const groupOrder = new Map<string, number>()
  for (const group of registry.groups) {
    groupOrder.set(group.id, group.order)
    groupOrder.set(group.title, group.order)
  }

  const grouped = new Map<string, SlashCommandItem[]>()
  for (const command of commands) {
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
