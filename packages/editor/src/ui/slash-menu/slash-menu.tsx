'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'
import type { CardExtension } from '../../card/card-extension'
import * as stylex from '@stylexjs/stylex'
import { canUseRegexLookbehind } from 'prosekit/core'
import { useEditor, useEditorDerivedValue } from 'prosekit/react'
import { AutocompletePopup, AutocompletePositioner, AutocompleteRoot } from 'prosekit/react/autocomplete'
import { useTranslation } from 'react-i18next'

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

function getLearningDisabledCardActions(editor: Editor<SlashMenuExtension>) {
  const { $from } = editor.state.selection
  let blockHighlight: unknown = null
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'list')
      continue
    blockHighlight = node.attrs.blockHighlight
    break
  }
  return {
    addToBack: false,
    blockHighlighted: blockHighlight !== null && blockHighlight !== undefined,
    cardMember: false,
    canInsert: {
      backward: false,
      both: false,
      forward: false,
    },
    canSetPresentation: false,
  }
}

export default function SlashMenu({ learningEnabled = true }: { learningEnabled?: boolean }) {
  const editor = useEditor<SlashMenuExtension>()
  const actions = useEditorDerivedValue(getEditorActions)
  const cardActions = useEditorDerivedValue(
    learningEnabled ? getCardActions : getLearningDisabledCardActions,
  )
  const { t } = useTranslation('editor')

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
              label={t('ui.text')}
              onSelect={actions.heading.paragraph.run}
            />

            <SlashMenuItem
              aliases={['h1']}
              label={t('ui.heading', { level: 1 })}
              kbd="#"
              onSelect={actions.heading.heading1.run}
            />

            <SlashMenuItem
              aliases={['h2']}
              label={t('ui.heading', { level: 2 })}
              kbd="##"
              onSelect={actions.heading.heading2.run}
            />

            <SlashMenuItem
              aliases={['h3']}
              label={t('ui.heading', { level: 3 })}
              kbd="###"
              onSelect={actions.heading.heading3.run}
            />

            <SlashMenuItem
              aliases={['h4']}
              label={t('ui.heading', { level: 4 })}
              kbd="####"
              onSelect={actions.heading.heading4.run}
            />

            <SlashMenuItem
              aliases={['h5']}
              label={t('ui.heading', { level: 5 })}
              kbd="#####"
              onSelect={actions.heading.heading5.run}
            />

            <SlashMenuItem
              aliases={['h6']}
              label={t('ui.heading', { level: 6 })}
              kbd="######"
              onSelect={actions.heading.heading6.run}
            />

            <SlashMenuItem
              aliases={['unordered list', 'ul']}
              label={t('ui.bulletList')}
              kbd="-"
              onSelect={actions.block.bulletList.run}
            />

            <SlashMenuItem
              aliases={['numbered list', 'ol']}
              label={t('ui.orderedList')}
              kbd="1."
              onSelect={actions.block.orderedList.run}
            />

            <SlashMenuItem
              aliases={['todo', 'checklist']}
              label={t('ui.taskList')}
              kbd="[]"
              onSelect={actions.block.taskList.run}
            />

            <SlashMenuItem
              aliases={['collapsible', 'details']}
              label={t('ui.toggleList')}
              kbd=">>"
              onSelect={actions.block.toggleList.run}
            />

            <SlashMenuItem
              aliases={['blockquote']}
              label={t('ui.quote')}
              kbd=">"
              onSelect={actions.block.blockquote.run}
            />

            <SlashMenuItem
              aliases={['grid']}
              label={t('ui.table')}
              onSelect={actions.insert.table.run}
            />

            <SlashMenuItem
              aliases={['horizontal rule', 'hr']}
              label={t('ui.divider')}
              kbd="---"
              onSelect={actions.insert.divider.run}
            />

            <SlashMenuItem
              aliases={['code block', 'pre']}
              label={t('ui.code')}
              kbd="```"
              onSelect={actions.block.codeBlock.run}
            />

            <SlashMenuItem
              aliases={['math', 'formula', 'equation', 'latex']}
              label={t('ui.inlineMath')}
              kbd="$"
              onSelect={actions.insert.inlineMath.run}
            />

            {cardActions.canInsert.forward
              ? <SlashMenuItem label={t('ui.basicCard')} kbd=":->" onSelect={() => editor.commands.insertBasicCard({ direction: 'forward' })} />
              : null}
            {cardActions.canInsert.backward
              ? <SlashMenuItem label={t('ui.reverseCard')} kbd=":-<" onSelect={() => editor.commands.insertBasicCard({ direction: 'backward' })} />
              : null}
            {cardActions.canInsert.both
              ? <SlashMenuItem label={t('ui.bidirectionalCard')} kbd=":<>" onSelect={() => editor.commands.insertBasicCard({ direction: 'both' })} />
              : null}
            {cardActions.canSetPresentation
              ? <SlashMenuItem label={t('ui.setCardAnswers')} onSelect={() => editor.commands.setCardPresentation({ presentation: 'set' })} />
              : null}
            {cardActions.canSetPresentation
              ? <SlashMenuItem label={t('ui.listCardAnswers')} onSelect={() => editor.commands.setCardPresentation({ presentation: 'list' })} />
              : null}
            {cardActions.addToBack
              ? <SlashMenuItem label={t('ui.addToCardBack')} onSelect={() => editor.commands.addBlockToCardBack()} />
              : null}
            {cardActions.cardMember
              ? <SlashMenuItem label={t('ui.removeFromCardBack')} onSelect={() => editor.commands.removeBlockFromCardBack()} />
              : null}
            <SlashMenuItem
              label={cardActions.blockHighlighted ? t('ui.removeBlockHighlight') : t('ui.highlightBlock')}
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
