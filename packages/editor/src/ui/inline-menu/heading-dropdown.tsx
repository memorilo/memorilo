'use client'

import type { EditorAction } from '../editor-actions/index.ts'
import * as stylex from '@stylexjs/stylex'
import { Check, ChevronDown } from 'lucide-react'
import { MenuItem, MenuPopup, MenuPositioner, MenuRoot, MenuTrigger } from 'prosekit/react/menu'

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

function getCurrentLabel(actions: HeadingActions): string {
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
  return 'Text'
}

export default function HeadingDropdown({ actions }: { actions: HeadingActions }) {
  const items = [
    { action: actions.paragraph, label: 'Text' },
    { action: actions.heading1, label: 'Heading 1' },
    { action: actions.heading2, label: 'Heading 2' },
    { action: actions.heading3, label: 'Heading 3' },
    { action: actions.heading4, label: 'Heading 4' },
    { action: actions.heading5, label: 'Heading 5' },
    { action: actions.heading6, label: 'Heading 6' },
  ]

  return (
    <MenuRoot>
      <MenuTrigger {...stylex.props(inlineMenuStyles.headingTrigger)}>
        <button
          {...stylex.props(buttonStyles.action, inlineMenuStyles.headingButton)}
          aria-label="Text style"
          type="button"
          onMouseDown={event => event.preventDefault()}
        >
          <span>{getCurrentLabel(actions)}</span>
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
          aria-label="Text style"
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
