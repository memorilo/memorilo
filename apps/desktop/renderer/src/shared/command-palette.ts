import type { LucideIcon } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { createContext, use, useLayoutEffect } from 'react'

export type CommandSection = 'Editor' | 'History' | 'Navigation' | 'Window'
export type ResultAccent = 'blue' | 'graphite' | 'violet'

export interface PaletteCommand {
  accent: ResultAccent
  action: string
  description: string
  disabled?: boolean
  icon: LucideIcon
  id: string
  keywords: readonly string[]
  label: string
  run: () => Promise<void> | void
  section: CommandSection
}

export const CommandPaletteCommandsContext = createContext<Dispatch<SetStateAction<readonly PaletteCommand[]>> | null>(null)

export function useCommandPaletteCommands(commands: readonly PaletteCommand[]): void {
  const setCommands = use(CommandPaletteCommandsContext)
  if (!setCommands)
    throw new Error('useCommandPaletteCommands must be used within AppShell')

  useLayoutEffect(() => {
    setCommands(commands)
    return () => setCommands(current => current === commands ? [] : current)
  }, [commands, setCommands])
}
