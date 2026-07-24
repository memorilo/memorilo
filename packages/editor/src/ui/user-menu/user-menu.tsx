'use client'

import type { BasicExtension } from 'prosekit/basic'
import type { Union } from 'prosekit/core'
import type { MentionExtension } from 'prosekit/extensions/mention'
import * as stylex from '@stylexjs/stylex'
import { canUseRegexLookbehind } from 'prosekit/core'
import { useEditor } from 'prosekit/react'
import {
  AutocompleteEmpty,
  AutocompleteItem,
  AutocompletePopup,
  AutocompletePositioner,
  AutocompleteRoot,
} from 'prosekit/react/autocomplete'

import { editorStyles } from '../../styles/editor.stylex'

// Match inputs like "@", "@foo", "@foo bar" etc. Do not match "@ foo".
const regex = new RegExp(
  (canUseRegexLookbehind() ? String.raw`(?<!\S)` : '')
  + String.raw`@(\S.*)?$`,
  'u',
)

export default function UserMenu(props: {
  users: { id: number, name: string }[]
  loading?: boolean
  onQueryChange?: (query: string) => void
  onOpenChange?: (open: boolean) => void
}) {
  const editor = useEditor<Union<[MentionExtension, BasicExtension]>>()

  const handleUserInsert = (id: number, username: string) => {
    editor.commands.insertMention({
      id: id.toString(),
      value: `@${username}`,
      kind: 'user',
    })
    editor.commands.insertText({ text: ' ' })
  }

  return (
    <AutocompleteRoot
      regex={regex}
      onQueryChange={event => props.onQueryChange?.(event.detail)}
      onOpenChange={event => props.onOpenChange?.(event.detail)}
    >
      <AutocompletePositioner {...stylex.props(editorStyles.positioner)}>
        <AutocompletePopup {...stylex.props(editorStyles.popup)}>
          <div {...stylex.props(editorStyles.popupContent)}>
            <AutocompleteEmpty {...stylex.props(editorStyles.menuItem)}>
              {props.loading ? 'Loading...' : 'No results'}
            </AutocompleteEmpty>

            {props.users.map(user => (
              <AutocompleteItem
                key={user.id}
                {...stylex.props(editorStyles.menuItem)}
                onSelect={() => handleUserInsert(user.id, user.name)}
              >
                <span {...stylex.props(props.loading && editorStyles.faded)}>
                  {user.name}
                </span>
              </AutocompleteItem>
            ))}
          </div>
        </AutocompletePopup>
      </AutocompletePositioner>
    </AutocompleteRoot>
  )
}
