'use client'

import * as stylex from '@stylexjs/stylex'
import { GripVertical, Plus } from 'lucide-react'
import { BlockHandleAdd, BlockHandleDraggable, BlockHandlePopup, BlockHandlePositioner, BlockHandleRoot } from 'prosekit/react/block-handle'

import { editorStyles } from '../../styles/editor.stylex'

interface Props {
  dir?: 'ltr' | 'rtl'
}

export default function BlockHandle(props: Props) {
  return (
    <BlockHandleRoot>
      <BlockHandlePositioner
        {...stylex.props(editorStyles.positioner)}
        placement={props.dir === 'rtl' ? 'right' : 'left'}
      >
        <BlockHandlePopup {...stylex.props(editorStyles.floatingSurfaceMotion, editorStyles.blockHandlePopup)}>
          <BlockHandleAdd {...stylex.props(editorStyles.blockHandleAdd)} aria-label="Add block"><Plus size={20} /></BlockHandleAdd>
          <BlockHandleDraggable {...stylex.props(editorStyles.blockHandleAdd, editorStyles.blockHandleDrag)} aria-label="Drag block"><GripVertical size={20} /></BlockHandleDraggable>
        </BlockHandlePopup>
      </BlockHandlePositioner>
    </BlockHandleRoot>
  )
}
