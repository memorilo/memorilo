import type { Editor, Range } from '@tiptap/core'
import type { IconType } from 'react-icons'

export type SlashCommandGroup = 'Text' | 'List' | 'Insert'

export interface SlashCommand {
  id: string
  title: string
  description?: string
  keywords?: string[]
  group: SlashCommandGroup
  icon?: IconType
  isEnabled?: (editor: Editor) => boolean
  command: (context: { editor: Editor, range: Range }) => void
}

export interface SlashCommandGroupConfig {
  id: SlashCommandGroup
  label: string
}
