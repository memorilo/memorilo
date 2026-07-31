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

            <SlashMenuEmpty />
          </div>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  )
}
