'use client'

import * as stylex from '@stylexjs/stylex'
import { AutocompleteItem } from 'prosekit/react/autocomplete'

import { autocompleteMenuStyles } from '../autocomplete-menu/autocomplete-menu.stylex'

export default function SlashMenuItem(props: {
  label: string
  kbd?: string
  onSelect: () => void
}) {
  return (
    <AutocompleteItem
      {...stylex.props(autocompleteMenuStyles.item)}
      onSelect={props.onSelect}
    >
      <span>{props.label}</span>
      {props.kbd && <kbd {...stylex.props(autocompleteMenuStyles.keyboard)}>{props.kbd}</kbd>}
    </AutocompleteItem>
  )
}
