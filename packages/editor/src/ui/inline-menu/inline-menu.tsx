'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'
import type { LinkAttrs } from 'prosekit/extensions/link'
import type { EditorState } from 'prosekit/pm/state'
import * as stylex from '@stylexjs/stylex'
import { Bold, Code2, Italic, Link2, Strikethrough, Underline } from 'lucide-react'
import { useEditor, useEditorDerivedValue } from 'prosekit/react'
import { InlinePopoverPopup, InlinePopoverPositioner, InlinePopoverRoot } from 'prosekit/react/inline-popover'
import { useState } from 'react'

import { editorStyles } from '../../styles/editor.stylex'
import { Button } from '../button/index.ts'
import { getEditorActions } from '../editor-actions/index.ts'
import HeadingDropdown from './heading-dropdown.tsx'

function getLinkState(editor: Editor<BasicExtension>) {
  return {
    isActive: editor.marks.link.isActive(),
    canExec: editor.commands.addLink.canExec({ href: '' }),
    command: () => editor.commands.expandLink(),
    currentLink: getCurrentLink(editor.state) ?? '',
  }
}

function getCurrentLink(state: EditorState): string | undefined {
  const { $from } = state.selection
  const marks = $from.marksAcross($from)
  if (!marks) {
    return
  }
  for (const mark of marks) {
    if (mark.type.name === 'link') {
      return (mark.attrs as LinkAttrs).href
    }
  }
}

export default function InlineMenu() {
  const editor = useEditor<BasicExtension>()
  const actions = useEditorDerivedValue(getEditorActions)
  const link = useEditorDerivedValue(getLinkState)

  const [linkMenuOpen, setLinkMenuOpen] = useState(false)
  const toggleLinkMenuOpen = () => setLinkMenuOpen(open => !open)

  const handleLinkUpdate = (href?: string) => {
    if (href) {
      editor.commands.addLink({ href })
    }
    else {
      editor.commands.removeLink()
    }

    setLinkMenuOpen(false)
    editor.focus()
  }

  return (
    <>
      <InlinePopoverRoot
        onOpenChange={(event) => {
          if (!event.detail) {
            setLinkMenuOpen(false)
          }
        }}
      >
        <InlinePopoverPositioner {...stylex.props(editorStyles.positioner)}>
          <InlinePopoverPopup
            {...stylex.props(
              editorStyles.floatingSurfaceMotion,
              editorStyles.popupSurface,
              editorStyles.inlineMainPopup,
            )}
            data-testid="inline-menu-main"
          >
            <HeadingDropdown actions={actions.heading} />
            <Button
              pressed={actions.mark.bold.active}
              disabled={!actions.mark.bold.canExec}
              onClick={actions.mark.bold.run}
              tooltip="Bold"
            >
              <Bold size={16} />
            </Button>
            <Button
              pressed={actions.mark.italic.active}
              disabled={!actions.mark.italic.canExec}
              onClick={actions.mark.italic.run}
              tooltip="Italic"
            >
              <Italic size={16} />
            </Button>
            <Button
              pressed={actions.mark.underline.active}
              disabled={!actions.mark.underline.canExec}
              onClick={actions.mark.underline.run}
              tooltip="Underline"
            >
              <Underline size={16} />
            </Button>
            <Button
              pressed={actions.mark.strike.active}
              disabled={!actions.mark.strike.canExec}
              onClick={actions.mark.strike.run}
              tooltip="Strikethrough"
            >
              <Strikethrough size={16} />
            </Button>
            <Button
              pressed={actions.mark.code.active}
              disabled={!actions.mark.code.canExec}
              onClick={actions.mark.code.run}
              tooltip="Code"
            >
              <Code2 size={16} />
            </Button>
            {link.canExec && (
              <Button
                pressed={link.isActive}
                onClick={() => {
                  link.command()
                  toggleLinkMenuOpen()
                }}
                tooltip="Link"
              >
                <Link2 size={16} />
              </Button>
            )}
          </InlinePopoverPopup>
        </InlinePopoverPositioner>
      </InlinePopoverRoot>

      <InlinePopoverRoot
        defaultOpen={false}
        open={linkMenuOpen}
        onOpenChange={event => setLinkMenuOpen(event.detail)}
      >
        <InlinePopoverPositioner {...stylex.props(editorStyles.positioner)} placement="bottom">
          <InlinePopoverPopup
            {...stylex.props(
              editorStyles.floatingSurfaceMotion,
              editorStyles.popupSurface,
              editorStyles.inlineLinkPopup,
            )}
            data-testid="inline-menu-link"
          >
            {linkMenuOpen && (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  const target = event.target as HTMLFormElement | null
                  const href = target?.querySelector('input')?.value?.trim()
                  handleLinkUpdate(href)
                }}
              >
                <input
                  {...stylex.props(editorStyles.textInput)}
                  placeholder="Paste the link..."
                  defaultValue={link.currentLink}
                />
              </form>
            )}
            {link.isActive && (
              <button
                {...stylex.props(editorStyles.primaryButton, editorStyles.removeButton)}
                type="button"
                onClick={() => handleLinkUpdate()}
                onMouseDown={event => event.preventDefault()}
              >
                Remove link
              </button>
            )}
          </InlinePopoverPopup>
        </InlinePopoverPositioner>
      </InlinePopoverRoot>
    </>
  )
}
