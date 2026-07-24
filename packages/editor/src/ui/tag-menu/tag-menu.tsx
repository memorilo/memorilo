'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Union } from 'prosekit/core'
import type { MentionExtension } from 'prosekit/extensions/mention'
import * as stylex from '@stylexjs/stylex'
import { useEditor } from 'prosekit/react'
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from 'prosekit/react/autocomplete'

import { editorStyles } from '../../styles/editor.stylex'

const regex = /#[\da-z]*$/i

export default function TagMenu(props: { tags: { id: number, label: string }[] }) {
  const editor = useEditor<Union<[MentionExtension, BasicExtension]>>()

  const handleTagInsert = (id: number, label: string) => {
    editor.commands.insertMention({
      id: id.toString(),
      value: `#${label}`,
      kind: 'tag',
    })
    editor.commands.insertText({ text: ' ' })
  }

  return (
    <AutocompleteRoot regex={regex}>
      <AutocompletePositioner {...stylex.props(editorStyles.positioner)}>
        <AutocompletePopup {...stylex.props(editorStyles.popup)}>
          <div {...stylex.props(editorStyles.popupContent)}>
            <AutocompleteEmpty {...stylex.props(editorStyles.menuItem)}>
              No results
            </AutocompleteEmpty>

            {props.tags.map(tag => (
              <AutocompleteItem
                key={tag.id}
                {...stylex.props(editorStyles.menuItem)}
                onSelect={() => handleTagInsert(tag.id, tag.label)}
              >
                #
                {tag.label}
              </AutocompleteItem>
            ))}
          </div>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  )
}
