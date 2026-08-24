'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Button as PublicButton } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { TooltipPopup, TooltipPositioner, TooltipRoot, TooltipTrigger } from 'prosekit/react/tooltip'
import { editorPositionerAdapterStyles } from '../floating-surface/editor-positioner-adapter.stylex'
import { editorButtonAdapterStyles } from './editor-button-adapter.stylex'

export default function Button({
  children,
  disabled = false,
  onMouseDown,
  pressed,
  ref,
  tooltip,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'children'> & {
  children: ReactNode
  pressed?: boolean
  ref?: Ref<HTMLButtonElement>
  tooltip?: string
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger {...stylex.props(editorButtonAdapterStyles.tooltipTrigger)}>
        <PublicButton
          {...props}
          data-state={pressed ? 'on' : 'off'}
          disabled={disabled}
          pressed={pressed}
          ref={ref}
          variant="icon"
          xstyle={editorButtonAdapterStyles.action}
          onMouseDown={(event) => {
            // Prevent the editor from being blurred when the button is clicked
            event.preventDefault()
            onMouseDown?.(event)
          }}
        >
          {children}
          {tooltip ? <span {...stylex.props(editorButtonAdapterStyles.visuallyHidden)}>{tooltip}</span> : null}
        </PublicButton>
      </TooltipTrigger>
      {tooltip
        ? (
            <TooltipPositioner {...stylex.props(editorPositionerAdapterStyles.positioner)}>
              <TooltipPopup {...stylex.props(editorPositionerAdapterStyles.motion, editorButtonAdapterStyles.tooltipPopup)}>
                {tooltip}
              </TooltipPopup>
            </TooltipPositioner>
          )
        : null}
    </TooltipRoot>
  )
}
