'use client'

import * as stylex from '@stylexjs/stylex'
import { AutocompleteItem } from 'prosekit/react/autocomplete'

import { editorStyles } from '../../styles/editor.stylex'

export default function SlashMenuItem(props: {
  label: string
  kbd?: string
  onSelect: () => void
}) {
  return (
    <AutocompleteItem {...stylex.props(editorStyles.menuItem)} onSelect={props.onSelect}>
      <span>{props.label}</span>
      {props.kbd && <kbd {...stylex.props(editorStyles.shortcut)}>{props.kbd}</kbd>}
    </AutocompleteItem>
  )
}
