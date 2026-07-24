'use client'

import * as stylex from '@stylexjs/stylex'
import { AutocompleteEmpty } from 'prosekit/react/autocomplete'

import { editorStyles } from '../../styles/editor.stylex'

export default function SlashMenuEmpty() {
  return (
    <AutocompleteEmpty {...stylex.props(editorStyles.autocompleteMenuItem)}>
      <span>No results</span>
    </AutocompleteEmpty>
  )
}
