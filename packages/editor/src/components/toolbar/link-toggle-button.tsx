import type { RangeRef } from 'slate'
import { LinkIcon } from '@memorilo/components/ui/animiated-icons/link'
import { Button } from '@memorilo/components/ui/button'
import { Input } from '@memorilo/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { Array, Option, pipe, Tuple } from 'effect'
import { useRef, useState } from 'react'
import { Editor, Range, Element as SlateElement, Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { isLink } from '../../lib/element-type'
import { UtilButton } from '../util-button'

function unwrapLink(editor: Editor, at: Range) {
  Transforms.unwrapNodes(editor, {
    at,
    match: n => SlateElement.isElement(n) && isLink(n),
    split: true,
  })
}

function wrapLink(editor: Editor, at: Range, url: string) {
  unwrapLink(editor, at)

  if (Range.isCollapsed(at)) {
    Transforms.insertNodes(editor, {
      type: 'link',
      url,
      children: [{ text: url }],
    } as any)
    return
  }

  Transforms.wrapNodes(editor, { type: 'link', url, children: [] } as any, { split: true })
  Transforms.collapse(editor, { edge: 'end' })
}

function getLinkUrlInRange(editor: Editor, at: Range): string | undefined {
  return pipe(
    Array.fromIterable(Editor.nodes(editor, {
      at,
      match: n => SlateElement.isElement(n) && isLink(n),
      mode: 'lowest',
    })),
    Array.head,
    Option.map(Tuple.getFirst),
    Option.map(node => node.url),
    Option.getOrUndefined,
  )
}

export function LinkToggleButton() {
  const editor = useSlateStatic()

  const selectionRef = useRef<RangeRef | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false)

  const { canToggle, isActive } = useSlateSelector((editor) => {
    if (!editor.selection) {
      return { canToggle: false, isActive: false }
    }

    const at = Editor.unhangRange(editor, editor.selection)
    const hasLink = getLinkUrlInRange(editor, at) !== undefined

    return { canToggle: true, isActive: hasLink }
  })

  const apply = () => {
    const nextSelection = selectionRef.current?.unref()
    selectionRef.current = null
    if (!nextSelection || !url.trim()) {
      setOpen(false)
      return
    }

    Transforms.select(editor, nextSelection)
    const at = Editor.unhangRange(editor, nextSelection)
    const hasLink = getLinkUrlInRange(editor, at) !== undefined

    Editor.withoutNormalizing(editor, () => {
      if (hasLink) {
        Transforms.setNodes(
          editor,
          { url: url.trim() } as any,
          {
            at,
            match: n => SlateElement.isElement(n) && isLink(n),
            split: true,
          },
        )
      }
      else {
        wrapLink(editor, at, url.trim())
      }
    })

    setOpen(false)
    ReactEditor.focus(editor)
  }

  const remove = () => {
    const nextSelection = selectionRef.current?.unref()
    selectionRef.current = null
    if (!nextSelection) {
      setOpen(false)
      return
    }

    Transforms.select(editor, nextSelection)
    const at = Editor.unhangRange(editor, nextSelection)
    Editor.withoutNormalizing(editor, () => unwrapLink(editor, at))

    setOpen(false)
    ReactEditor.focus(editor)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          selectionRef.current?.unref()
          selectionRef.current = null
          setIsEditingExistingLink(false)
          ReactEditor.focus(editor)
        }
      }}
    >
      <PopoverTrigger asChild>
        <UtilButton
          disabled={!canToggle}
          title="Link"
          className={cn(isActive ? 'text-blue-600 font-bold' : '')}
          contentEditable={false}
          onMouseDown={(e: any) => {
            e.preventDefault()
            if (!editor.selection)
              return

            const at = Editor.unhangRange(editor, editor.selection)
            const existingUrl = getLinkUrlInRange(editor, at)

            selectionRef.current?.unref()
            selectionRef.current = Editor.rangeRef(editor, at, { affinity: 'forward' })

            setIsEditingExistingLink(existingUrl !== undefined)
            setUrl(existingUrl ?? 'https://')
            setOpen(value => !value)
          }}
        >
          <LinkIcon size={16} />
        </UtilButton>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 space-y-2"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          ReactEditor.focus(editor)
        }}
        onMouseDown={(e) => {
          e.preventDefault()
        }}
      >
        <Input
          ref={inputRef}
          value={url}
          placeholder="https://example.com"
          onChange={(e) => {
            setUrl(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              apply()
            }
            else if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
            }
          }}
        />
        <div className="flex items-center justify-end gap-2">
          {isEditingExistingLink && (
            <Button
              variant="destructive"
              onClick={(e: any) => {
                e.preventDefault()
                remove()
              }}
            >
              Remove
            </Button>
          )}
          <Button
            onClick={(e: any) => {
              e.preventDefault()
              apply()
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
