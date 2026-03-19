import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@memorilo/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { useState } from 'react'
import { LuCheck, LuChevronDown } from 'react-icons/lu'
import { languageMap, languages } from '../libs/languages'

interface LanguageSelectProps {
  value: string
  onChange: (value: string) => void
}
export function LanguageSelect(props: LanguageSelectProps) {
  const [open, setOpen] = useState(false)
  const displayLanguage = languageMap[props.value] ?? props.value
  const languageOptions = [{ key: 'text', label: 'Text' }].concat(...languages)

  const handleSelect = (value: string) => {
    if (value !== props.value) {
      props.onChange(value)
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={popoverProps => (
          <button
            type="button"
            {...popoverProps}
            contentEditable={false}
            className="absolute right-0.5 top-0.5 flex cursor-pointer items-center gap-1 rounded border px-2 py-1 font-mono text-sm select-none"
          >
            {displayLanguage}
            <LuChevronDown />
          </button>
        )}
      />

      <PopoverContent contentEditable={false} className="overflow-hidden gap-0 p-0">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandList>
            <CommandEmpty>
              No language found
            </CommandEmpty>
            {languageOptions.map(language => (
              <CommandItem
                key={language.key}
                value={language.key}
                onSelect={handleSelect}
                className="data-[selected=false]:bg-transparent! data-[selected=true]:bg-muted! data-[selected=true]:text-foreground! [&>svg:last-child]:hidden"
              >
                <span className="min-w-0 flex-1">{language.label}</span>
                <span
                  data-slot="selected-indicator"
                  aria-hidden="true"
                  className={cn(
                    'text-muted-foreground ml-auto flex size-4 items-center justify-center',
                    language.key !== props.value && 'opacity-0',
                    language.key === props.value && 'text-foreground',
                  )}
                >
                  <LuCheck className="size-4" />
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
