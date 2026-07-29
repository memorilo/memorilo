'use client'

import * as stylex from '@stylexjs/stylex'
import { canUseRegexLookbehind } from 'prosekit/core'
import { useEditorDerivedValue } from 'prosekit/react'
import { AutocompletePopup, AutocompletePositioner, AutocompleteRoot } from 'prosekit/react/autocomplete'

import { autocompleteMenuStyles } from '../autocomplete-menu/autocomplete-menu.stylex'
import { getEditorActions } from '../editor-actions/index.ts'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import SlashMenuEmpty from './slash-menu-empty.tsx'
import SlashMenuItem from './slash-menu-item.tsx'

// Match inputs like "/", "/table", "/heading 1" etc. Do not match "/ heading".
const regex = new RegExp(
  (canUseRegexLookbehind() ? String.raw`(?<!\S)` : '')
  + String.raw`\/(\S.*)?$`,
  'u',
)

export default function SlashMenu() {
  const actions = useEditorDerivedValue(getEditorActions)

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
              label="Text"
              onSelect={actions.heading.paragraph.run}
            />

            <SlashMenuItem
              label="Heading 1"
              kbd="#"
              onSelect={actions.heading.heading1.run}
            />

            <SlashMenuItem
              label="Heading 2"
              kbd="##"
              onSelect={actions.heading.heading2.run}
            />

            <SlashMenuItem
              label="Heading 3"
              kbd="###"
              onSelect={actions.heading.heading3.run}
            />

            <SlashMenuItem
              label="Heading 4"
              kbd="####"
              onSelect={actions.heading.heading4.run}
            />

            <SlashMenuItem
              label="Heading 5"
              kbd="#####"
              onSelect={actions.heading.heading5.run}
            />

            <SlashMenuItem
              label="Heading 6"
              kbd="######"
              onSelect={actions.heading.heading6.run}
            />

            <SlashMenuItem
              label="Bullet list"
              kbd="-"
              onSelect={actions.block.bulletList.run}
            />

            <SlashMenuItem
              label="Ordered list"
              kbd="1."
              onSelect={actions.block.orderedList.run}
            />

            <SlashMenuItem
              label="Task list"
              kbd="[]"
              onSelect={actions.block.taskList.run}
            />

            <SlashMenuItem
              label="Toggle list"
              kbd=">>"
              onSelect={actions.block.toggleList.run}
            />

            <SlashMenuItem
              label="Quote"
              kbd=">"
              onSelect={actions.block.blockquote.run}
            />

            <SlashMenuItem
              label="Table"
              onSelect={actions.insert.table.run}
            />

            <SlashMenuItem
              label="Divider"
              kbd="---"
              onSelect={actions.insert.divider.run}
            />

            <SlashMenuItem
              label="Code"
              kbd="```"
              onSelect={actions.block.codeBlock.run}
            />

            <SlashMenuEmpty />
          </div>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  )
}
