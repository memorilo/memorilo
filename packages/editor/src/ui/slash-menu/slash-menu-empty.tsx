'use client'

import * as stylex from '@stylexjs/stylex'
import { AutocompleteEmpty } from 'prosekit/react/autocomplete'

import { autocompleteMenuStyles } from '../autocomplete-menu/autocomplete-menu.stylex'

export default function SlashMenuEmpty() {
  return (
    <AutocompleteEmpty {...stylex.props(autocompleteMenuStyles.item)}>
      <span>No results</span>
    </AutocompleteEmpty>
  )
}
