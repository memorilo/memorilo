import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@memorilo/components/ui/dropdown-menu'
import { Option, pipe } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('app')
  const autoLabel = t('editor.codeblock.auto')
  const [open, setOpen] = useState(false)
  const selectedLabel = pipe(
    Option.fromNullable(options.find(option => option.id === value)),
    Option.map(option => option.label),
    Option.getOrElse(() => autoLabel),
  )

  const handleSelect = (nextValue: string) => {
    setOpen(false)
    onSelect(nextValue)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        type="button"
        aria-label={t('editor.codeblock.language')}
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
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        alignOffset={0}
        sideOffset={0}
        className="p-0 overflow-hidden"
      >
        <Command className="w-48">
          <CommandInput placeholder={t('editor.codeblock.search_language')} />
          <CommandList>
            <CommandEmpty>{t('editor.codeblock.no_language_found')}</CommandEmpty>
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
