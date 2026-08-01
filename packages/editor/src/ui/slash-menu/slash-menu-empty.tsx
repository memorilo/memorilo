'use client'

import * as stylex from '@stylexjs/stylex'
import { AutocompleteEmpty } from 'prosekit/react/autocomplete'
import { useTranslation } from 'react-i18next'

import { autocompleteMenuStyles } from '../autocomplete-menu/autocomplete-menu.stylex'

export default function SlashMenuEmpty() {
  const { t } = useTranslation('editor')
  return (
    <AutocompleteEmpty {...stylex.props(autocompleteMenuStyles.item)}>
      <span>{t('ui.noResults')}</span>
    </AutocompleteEmpty>
  )
}
