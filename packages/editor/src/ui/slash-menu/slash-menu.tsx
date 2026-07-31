'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'
import type { CardExtension } from '../../card/card-extension'
import * as stylex from '@stylexjs/stylex'
import { canUseRegexLookbehind } from 'prosekit/core'
import { useEditor, useEditorDerivedValue } from 'prosekit/react'
import { AutocompletePopup, AutocompletePositioner, AutocompleteRoot } from 'prosekit/react/autocomplete'

import { autocompleteMenuStyles } from '../autocomplete-menu/autocomplete-menu.stylex'
import { getEditorActions } from '../editor-actions/index.ts'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import SlashMenuEmpty from './slash-menu-empty.tsx'
import SlashMenuItem from './slash-menu-item.tsx'

// Match inputs like "/table" or "、table". Do not match a trigger followed by a space.
const regex = new RegExp(
  (canUseRegexLookbehind() ? String.raw`(?<!\S)` : '')
  + String.raw`[/、](\S.*)?$`,
  'u',
)

type SlashMenuExtension = BasicExtension & CardExtension

function getCardActions(editor: Editor<SlashMenuExtension>) {
  const { $from } = editor.state.selection
  let blockHighlight: unknown = null
  let cardMember = false
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'list')
      continue
    blockHighlight = node.attrs.blockHighlight
    cardMember = node.attrs.cardItemDefinitionId !== null && node.attrs.cardItemDefinitionId !== undefined
    break
  }
  return {
    addToBack: editor.commands.addBlockToCardBack.canExec(),
    blockHighlighted: blockHighlight !== null && blockHighlight !== undefined,
    cardMember,
    canInsert: {
      backward: editor.commands.insertBasicCard.canExec({ direction: 'backward' }),
      both: editor.commands.insertBasicCard.canExec({ direction: 'both' }),
      forward: editor.commands.insertBasicCard.canExec({ direction: 'forward' }),
    },
    canSetPresentation: editor.commands.setCardPresentation.canExec({ presentation: 'set' }),
  }
}

export default function SlashMenu() {
  const editor = useEditor<SlashMenuExtension>()
  const actions = useEditorDerivedValue(getEditorActions)
  const cardActions = useEditorDerivedValue(getCardActions)

  return (
    <AutocompleteRoot regex={regex}>
      <AutocompletePositioner {...stylex.props(floatingSurfaceStyles.positioner)}>
        <AutocompletePopup
          {...stylex.props(
            floatingSurfaceStyles.motion,
            floatingSurfaceStyles.surface,
            autocompleteMenuStyles.popup,
          )}
        >
          <div {...stylex.props(autocompleteMenuStyles.content)}>
            <SlashMenuItem
              aliases={['paragraph', 'p']}
              label="Text"
              onSelect={actions.heading.paragraph.run}
            />

            <SlashMenuItem
              aliases={['h1']}
              label="Heading 1"
              kbd="#"
              onSelect={actions.heading.heading1.run}
            />

            <SlashMenuItem
              aliases={['h2']}
              label="Heading 2"
              kbd="##"
              onSelect={actions.heading.heading2.run}
            />

            <SlashMenuItem
              aliases={['h3']}
              label="Heading 3"
              kbd="###"
              onSelect={actions.heading.heading3.run}
            />

            <SlashMenuItem
              aliases={['h4']}
              label="Heading 4"
              kbd="####"
              onSelect={actions.heading.heading4.run}
            />

            <SlashMenuItem
              aliases={['h5']}
              label="Heading 5"
              kbd="#####"
              onSelect={actions.heading.heading5.run}
            />

            <SlashMenuItem
              aliases={['h6']}
              label="Heading 6"
              kbd="######"
              onSelect={actions.heading.heading6.run}
            />

            <SlashMenuItem
              aliases={['unordered list', 'ul']}
              label="Bullet list"
              kbd="-"
              onSelect={actions.block.bulletList.run}
            />

            <SlashMenuItem
              aliases={['numbered list', 'ol']}
              label="Ordered list"
              kbd="1."
              onSelect={actions.block.orderedList.run}
            />

            <SlashMenuItem
              aliases={['todo', 'checklist']}
              label="Task list"
              kbd="[]"
              onSelect={actions.block.taskList.run}
            />

            <SlashMenuItem
              aliases={['collapsible', 'details']}
              label="Toggle list"
              kbd=">>"
              onSelect={actions.block.toggleList.run}
            />

            <SlashMenuItem
              aliases={['blockquote']}
              label="Quote"
              kbd=">"
              onSelect={actions.block.blockquote.run}
            />

            <SlashMenuItem
              aliases={['grid']}
              label="Table"
              onSelect={actions.insert.table.run}
            />

            <SlashMenuItem
              aliases={['horizontal rule', 'hr']}
              label="Divider"
              kbd="---"
              onSelect={actions.insert.divider.run}
            />

            <SlashMenuItem
              aliases={['code block', 'pre']}
              label="Code"
              kbd="```"
              onSelect={actions.block.codeBlock.run}
            />

            <SlashMenuItem
              aliases={['math', 'formula', 'equation', 'latex']}
              label="Inline math"
              kbd="$"
              onSelect={actions.insert.inlineMath.run}
            />

            {cardActions.canInsert.forward
              ? <SlashMenuItem label="Basic card" kbd=":->" onSelect={() => editor.commands.insertBasicCard({ direction: 'forward' })} />
              : null}
            {cardActions.canInsert.backward
              ? <SlashMenuItem label="Reverse card" kbd=":-<" onSelect={() => editor.commands.insertBasicCard({ direction: 'backward' })} />
              : null}
            {cardActions.canInsert.both
              ? <SlashMenuItem label="Bidirectional card" kbd=":<>" onSelect={() => editor.commands.insertBasicCard({ direction: 'both' })} />
              : null}
            {cardActions.canSetPresentation
              ? <SlashMenuItem label="Set card answers" onSelect={() => editor.commands.setCardPresentation({ presentation: 'set' })} />
              : null}
            {cardActions.canSetPresentation
              ? <SlashMenuItem label="List card answers" onSelect={() => editor.commands.setCardPresentation({ presentation: 'list' })} />
              : null}
            {cardActions.addToBack
              ? <SlashMenuItem label="Add to card back" onSelect={() => editor.commands.addBlockToCardBack()} />
              : null}
            {cardActions.cardMember
              ? <SlashMenuItem label="Remove from card back" onSelect={() => editor.commands.removeBlockFromCardBack()} />
              : null}
            <SlashMenuItem
              label={cardActions.blockHighlighted ? 'Remove block highlight' : 'Highlight block'}
              onSelect={() => {
                if (cardActions.blockHighlighted)
                  editor.commands.removeBlockHighlight()
                else
                  editor.commands.setBlockHighlight({ color: 'yellow' })
              }}
            />

            <SlashMenuEmpty />
          </div>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  )
}
