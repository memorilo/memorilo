import type { RenderElementProps } from 'slate-react'
import type { CodeBlockElementType } from '../../../slate'
import log from '@memorilo/api/log'
import { useIsMobile } from '@memorilo/components/hooks/use-mobile'
import { Button } from '@memorilo/components/ui/button'
import { Command, CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList } from '@memorilo/components/ui/command'
import { Popover, PopoverAnchor, PopoverContent } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { Array, Effect } from 'effect'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuChevronDown } from 'react-icons/lu'
import { Node, Transforms } from 'slate'
import { ReactEditor, useFocused, useSelected, useSlateStatic } from 'slate-react'
import { supportedLanguages } from '../../../lib/decorate'
import { guessLanguage } from '../../../lib/guess-language'
import './theme-tomorrownight.css'

export function CodeBlock(props: RenderElementProps) {
  const element = props.element as CodeBlockElementType
  const editor = useSlateStatic()
  const codeRef = useRef<HTMLPreElement>(null)
  const selected = useSelected()
  const focused = useFocused()
  const wasFocused = useRef(false)
  const path = useMemo(() => ReactEditor.findPath(editor, element), [editor, element])
  const isMobile = useIsMobile()
  const [languageOptionDialogOpen, setLanguageOptionDialogOpen] = useState(false)

  // detect language when code block is blurred and language is not set
  useEffect(() => {
    const isFocused = selected && focused
    if (wasFocused.current && !isFocused) {
      const code = element.children.map(line => Node.string(line)).join('\n')
      if (!element.language) {
        Effect.runPromise(Effect.gen(function* () {
          const languages = yield* guessLanguage(code)
          const mostProb = yield* Array.head(languages)
          log.trace('Language detection result:', mostProb)
          Transforms.setNodes(editor, { guessLanguage: mostProb.languageId }, { at: path })
        })).catch((err) => {
          console.error('Language detection failed:', err)
          // TODO: handle error
        })
      }
    }
    wasFocused.current = isFocused
  }, [selected, focused, editor, element, path])
  const language = element.language ?? element.guessLanguage ?? 'text'

  const applyLanguageCmd = useCallback((id?: string) => {
    Transforms.setNodes(editor, { language: id }, { at: path })
    setLanguageOptionDialogOpen(false)
  }, [editor, path])

  const commandContent = useMemo(() => (
    <>
      <CommandInput />
      <CommandList>
        <CommandEmpty>
          No language found.
        </CommandEmpty>
        <CommandItem value="auto-detect" onSelect={() => applyLanguageCmd(undefined)}>
          <span>Auto Detect</span>
        </CommandItem>
        {
          supportedLanguages.map(item => (
            <CommandItem
              value={item.id}
              key={item.id}
              onSelect={() => applyLanguageCmd(item.id)}
            >
              <span>{item.label}</span>
            </CommandItem>
          ))
        }
      </CommandList>
    </>
  ), [applyLanguageCmd])

  const languageSelectButton = (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        'p-2 group-hover:visible',
        {
          // Show button when code block is hovered or language option dialog is open
          invisible: !languageOptionDialogOpen,
        },
      )}
      contentEditable={false}
      onClick={() => setLanguageOptionDialogOpen(true)}
    >
      {element.language ?? 'Auto'}
      <LuChevronDown />
    </Button>
  )

  const languageSelect = isMobile
    ? (
        <>
          <CommandDialog open={languageOptionDialogOpen} onOpenChange={setLanguageOptionDialogOpen}>
            {commandContent}
          </CommandDialog>
          {languageSelectButton}
        </>
      )
    : (

        <Popover open={languageOptionDialogOpen} onOpenChange={setLanguageOptionDialogOpen}>
          <PopoverAnchor asChild>
            {languageSelectButton}
          </PopoverAnchor>
          <PopoverContent className="p-0">
            <Command>
              {commandContent}
            </Command>
          </PopoverContent>
        </Popover>
      )

  return (
    <div className="group relative py-2">
      <div className="absolute right-2 top-2 z-50">
        {languageSelect}
      </div>
      <pre
        className={cn('rounded px-3 py-2 font-mono text-sm border bg-secondary/20', `language-${language}`)}
        style={{
          margin: 0, // override margin from prism cs
        }}
        ref={codeRef}
      >
        <code {...props.attributes}>
          {props.children}
        </code>
      </pre>
    </div>

  )
}

export function CodeLine(props: RenderElementProps) {
  return (
    <div {...props.attributes} className="relative">
      {props.children}
    </div>
  )
}
