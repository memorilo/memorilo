'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'
import type { LinkAttrs } from 'prosekit/extensions/link'
import type { EditorState } from 'prosekit/pm/state'
import type { CardExtension } from '../../card/card-extension'
import * as stylex from '@stylexjs/stylex'
import { Bold, Brackets, Code2, Highlighter, Italic, Link2, Strikethrough, Underline } from 'lucide-react'
import { useEditor, useEditorDerivedValue } from 'prosekit/react'
import { InlinePopoverPopup, InlinePopoverPositioner, InlinePopoverRoot } from 'prosekit/react/inline-popover'
import { useState } from 'react'
import { getSelectedCardDefinitionId } from '../../card/card-extension'

import { Button } from '../button/index.ts'
import { getEditorActions } from '../editor-actions/index.ts'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import { formControlStyles } from '../form-controls/form-controls.stylex'
import HeadingDropdown from './heading-dropdown.tsx'
import { inlineMenuStyles } from './inline-menu.stylex'

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

type InlineMenuExtension = BasicExtension & CardExtension

function getCardSelectionState(editor: Editor<InlineMenuExtension>) {
  const cloze = editor.marks.cloze.isActive()
  const highlight = editor.marks.inlineHighlight.isActive()
  const canAddMathCloze = editor.commands.addCloze.canExec({ anchorKind: 'math-source' })
  const canAddRichCloze = editor.commands.addCloze.canExec({ anchorKind: 'rich-content' })
  return {
    cardUiSelected: getSelectedCardDefinitionId(editor.state) !== null,
    canCloze: cloze || canAddMathCloze || canAddRichCloze,
    canHighlight: highlight || editor.commands.setInlineHighlight.canExec({ color: 'yellow' }),
    cloze,
    clozeAnchorKind: canAddMathCloze ? 'math-source' as const : 'rich-content' as const,
    highlight,
    mathSourceSelection: canAddMathCloze,
  }
}

export default function InlineMenu() {
  const editor = useEditor<InlineMenuExtension>()
  const actions = useEditorDerivedValue(getEditorActions)
  const link = useEditorDerivedValue(getLinkState)
  const cardSelection = useEditorDerivedValue(getCardSelectionState)

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

  if (cardSelection.cardUiSelected || cardSelection.mathSourceSelection)
    return null

  return (
    <>
      <InlinePopoverRoot
        onOpenChange={(event) => {
          if (!event.detail) {
            setLinkMenuOpen(false)
          }
        }}
      >
        <InlinePopoverPositioner {...stylex.props(floatingSurfaceStyles.positioner)}>
          <InlinePopoverPopup
            {...stylex.props(
              floatingSurfaceStyles.motion,
              floatingSurfaceStyles.surface,
              inlineMenuStyles.mainPopup,
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
            <Button
              pressed={cardSelection.cloze}
              disabled={!cardSelection.canCloze}
              onClick={() => {
                if (cardSelection.cloze)
                  editor.commands.removeCloze()
                else
                  editor.commands.addCloze({ anchorKind: cardSelection.clozeAnchorKind })
              }}
              tooltip={cardSelection.cloze ? 'Remove cloze' : 'Cloze'}
            >
              <Brackets size={16} />
            </Button>
            <Button
              pressed={cardSelection.highlight}
              disabled={!cardSelection.canHighlight}
              onClick={() => {
                if (cardSelection.highlight)
                  editor.commands.removeInlineHighlight()
                else
                  editor.commands.setInlineHighlight({ color: 'yellow' })
              }}
              tooltip={cardSelection.highlight ? 'Remove highlight' : 'Highlight'}
            >
              <Highlighter size={16} />
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
        <InlinePopoverPositioner {...stylex.props(floatingSurfaceStyles.positioner)} placement="bottom">
          <InlinePopoverPopup
            {...stylex.props(
              floatingSurfaceStyles.motion,
              floatingSurfaceStyles.surface,
              inlineMenuStyles.linkPopup,
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
                  {...stylex.props(formControlStyles.textInput)}
                  placeholder="Paste the link..."
                  defaultValue={link.currentLink}
                />
              </form>
            )}
            {link.isActive && (
              <button
                {...stylex.props(formControlStyles.primaryButton, inlineMenuStyles.removeButton)}
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
