import type { RangeRef } from 'slate'
import { LinkIcon } from '@memorilo/components/ui/animiated-icons/link'
import { Button } from '@memorilo/components/ui/button'
import { Input } from '@memorilo/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { useRef, useState } from 'react'
import { Editor, Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { getLinkUrlInRange, insertLink, setLinkUrlInRange, unwrapLink } from '../../lib/transforms/link'
import { UtilButton } from '../util-button'

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
        setLinkUrlInRange(editor, at, url.trim())
      }
      else {
        insertLink(editor, url.trim(), { unwrapExisting: true })
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
