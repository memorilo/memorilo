'use client'

import type { MouseEventHandler, ReactNode } from 'react'
import { Button as PublicButton } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { TooltipPopup, TooltipPositioner, TooltipRoot, TooltipTrigger } from 'prosekit/react/tooltip'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import { buttonStyles } from './button.stylex'

export default function Button(props: {
  pressed?: boolean
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  tooltip?: string
  children: ReactNode
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger {...stylex.props(buttonStyles.tooltipTrigger)}>
        <PublicButton
          data-state={props.pressed ? 'on' : 'off'}
          disabled={props.disabled}
          pressed={props.pressed}
          variant="icon"
          xstyle={[buttonStyles.action, props.pressed && buttonStyles.pressed]}
          onClick={props.onClick}
          onMouseDown={(event) => {
            // Prevent the editor from being blurred when the button is clicked
            event.preventDefault()
          }}
        >
          {props.children}
          {props.tooltip ? <span {...stylex.props(buttonStyles.visuallyHidden)}>{props.tooltip}</span> : null}
        </PublicButton>
      </TooltipTrigger>
      {props.tooltip
        ? (
            <TooltipPositioner {...stylex.props(floatingSurfaceStyles.positioner)}>
              <TooltipPopup {...stylex.props(floatingSurfaceStyles.motion, buttonStyles.tooltipPopup)}>
                {props.tooltip}
              </TooltipPopup>
            </TooltipPositioner>
          )
        : null}
    </TooltipRoot>
  )
}
