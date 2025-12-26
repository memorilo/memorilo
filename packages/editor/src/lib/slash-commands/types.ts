import type { ReactNode } from 'react'
import type { MemoriloEditor } from '../../slate'

export interface SlashCommandContext {
  editor: MemoriloEditor
}

export interface SlashCommandItem {
  id: string
  /**
   * Display name key (i18n, ns=app).
   */
  title: string
  /**
   * i18n key (ns=app).
   */
  description?: string
  group: string
  keywords?: string[]
  shortcut?: string
  icon?: ReactNode
  hidden?: (ctx: SlashCommandContext) => boolean
  disabled?: (ctx: SlashCommandContext) => boolean
  /**
   * Optional reason key (ns=app) shown when a command is disabled.
   */
  disabledReason?: (ctx: SlashCommandContext) => string | undefined
  run: (ctx: SlashCommandContext) => void
}

export interface SlashCommandGroup {
  id: string
  title: string
  order: number
}

export interface SlashCommandRegistry {
  groups: SlashCommandGroup[]
  commands: SlashCommandItem[]
}
