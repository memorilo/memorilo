'use client'

import type { MouseEventHandler, ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'
import { TooltipPopup, TooltipPositioner, TooltipRoot, TooltipTrigger } from 'prosekit/react/tooltip'

import { editorStyles } from '../../styles/editor.stylex'

export default function Button(props: {
  pressed?: boolean
  disabled?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
  tooltip?: string
  children: ReactNode
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger>
        <button
          {...stylex.props(editorStyles.actionButton, props.pressed && editorStyles.actionButtonPressed)}
          data-state={props.pressed ? 'on' : 'off'}
          disabled={props.disabled}
          type="button"
          onClick={props.onClick}
          onMouseDown={(event) => {
            // Prevent the editor from being blurred when the button is clicked
            event.preventDefault()
          }}
        >
          {props.children}
          {props.tooltip ? <span {...stylex.props(editorStyles.visuallyHidden)}>{props.tooltip}</span> : null}
        </button>
      </TooltipTrigger>
      {props.tooltip
        ? (
            <TooltipPositioner {...stylex.props(editorStyles.positioner)}>
              <TooltipPopup {...stylex.props(editorStyles.tooltipPopup)}>
                {props.tooltip}
              </TooltipPopup>
            </TooltipPositioner>
          )
        : null}
    </TooltipRoot>
  )
}
