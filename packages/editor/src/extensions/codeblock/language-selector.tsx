import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@memorilo/components/ui/dropdown-menu'
import { Option, pipe } from 'effect'
import { useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from './command'

interface LanguageOption {
  id: string
  label: string
}

interface LanguageSelectorProps {
  value: string
  options: LanguageOption[]
  onSelect: (value: string) => void
}

export function LanguageSelector({ value, options, onSelect }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false)
  const selectedLabel = pipe(
    Option.fromNullable(options.find(option => option.id === value)),
    Option.map(option => option.label),
    Option.getOrElse(() => 'Auto'),
  )

  const handleSelect = (nextValue: string) => {
    setOpen(false)
    onSelect(nextValue)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Code block language"
          className="min-w-[80px] h-4 px-1 py-0 text-[9px] gap-1 border border-[var(--white)]/80 bg-transparent text-[var(--white)] ring-0 shadow-none inline-flex items-center justify-between"
        >
          <span className="pointer-events-none">{selectedLabel}</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="size-3 opacity-50"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 8 4 4 4-4" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        alignOffset={0}
        sideOffset={0}
        className="p-0 overflow-hidden"
      >
        <Command className="w-48">
          <CommandInput placeholder="Search language..." />
          <CommandList>
            <CommandEmpty>No language found.</CommandEmpty>
            {options.map(option => (
              <CommandItem
                key={option.id}
                value={option.id}
                keywords={[option.label, option.id]}
                onSelect={handleSelect}
              >
                {option.label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
