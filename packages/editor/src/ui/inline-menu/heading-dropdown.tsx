'use client'

import type { TFunction } from 'i18next'
import type { EditorAction } from '../editor-actions/index.ts'
import * as stylex from '@stylexjs/stylex'
import { Check, ChevronDown } from 'lucide-react'
import { MenuItem, MenuPopup, MenuPositioner, MenuRoot, MenuTrigger } from 'prosekit/react/menu'
import { useTranslation } from 'react-i18next'

import { buttonStyles } from '../button/button.stylex'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import { inlineMenuStyles } from './inline-menu.stylex'

interface HeadingActions {
  paragraph: EditorAction
  heading1: EditorAction
  heading2: EditorAction
  heading3: EditorAction
  heading4: EditorAction
  heading5: EditorAction
  heading6: EditorAction
}

function getCurrentLabel(actions: HeadingActions, t: TFunction): string {
  if (actions.heading1.active)
    return 'H1'
  if (actions.heading2.active)
    return 'H2'
  if (actions.heading3.active)
    return 'H3'
  if (actions.heading4.active)
    return 'H4'
  if (actions.heading5.active)
    return 'H5'
  if (actions.heading6.active)
    return 'H6'
  return t('ui.text')
}

export default function HeadingDropdown({ actions }: { actions: HeadingActions }) {
  const { t } = useTranslation('editor')
  const items = [
    { action: actions.paragraph, label: t('ui.text') },
    { action: actions.heading1, label: t('ui.heading', { level: 1 }) },
    { action: actions.heading2, label: t('ui.heading', { level: 2 }) },
    { action: actions.heading3, label: t('ui.heading', { level: 3 }) },
    { action: actions.heading4, label: t('ui.heading', { level: 4 }) },
    { action: actions.heading5, label: t('ui.heading', { level: 5 }) },
    { action: actions.heading6, label: t('ui.heading', { level: 6 }) },
  ]

  return (
    <MenuRoot>
      <MenuTrigger {...stylex.props(inlineMenuStyles.headingTrigger)}>
        <button
          {...stylex.props(buttonStyles.action, inlineMenuStyles.headingButton)}
          aria-label={t('ui.textStyle')}
          type="button"
          onMouseDown={event => event.preventDefault()}
        >
          <span>{getCurrentLabel(actions, t)}</span>
          <ChevronDown aria-hidden="true" size={14} />
        </button>
      </MenuTrigger>
      <MenuPositioner {...stylex.props(floatingSurfaceStyles.positioner)} placement="bottom-start">
        <MenuPopup
          {...stylex.props(
            floatingSurfaceStyles.motion,
            floatingSurfaceStyles.surface,
            inlineMenuStyles.headingPopup,
          )}
          aria-label={t('ui.textStyle')}
          onMouseDown={event => event.preventDefault()}
        >
          {items.map(({ action, label }) => (
            <MenuItem
              key={label}
              {...stylex.props(inlineMenuStyles.headingItem)}
              disabled={!action.canExec}
              onSelect={action.run}
            >
              <span>{label}</span>
              {action.active ? <Check aria-hidden="true" size={16} /> : null}
            </MenuItem>
          ))}
        </MenuPopup>
      </MenuPositioner>
    </MenuRoot>
  )
}
