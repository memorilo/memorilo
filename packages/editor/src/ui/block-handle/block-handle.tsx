'use client'

import * as stylex from '@stylexjs/stylex'
import { GripVertical, Plus } from 'lucide-react'
import { BlockHandleAdd, BlockHandleDraggable, BlockHandlePopup, BlockHandlePositioner, BlockHandleRoot } from 'prosekit/react/block-handle'

import { editorStyles } from '../../styles/editor.stylex'

export default function BlockHandle() {
  return (
    <BlockHandleRoot>
      <BlockHandlePositioner {...stylex.props(editorStyles.handlePositioner)} placement="left">
        <BlockHandlePopup {...stylex.props(editorStyles.handlePopup)}>
          <BlockHandleAdd {...stylex.props(editorStyles.actionButton)} aria-label="Add block"><Plus size={15} /></BlockHandleAdd>
          <BlockHandleDraggable {...stylex.props(editorStyles.actionButton)} aria-label="Drag block"><GripVertical size={15} /></BlockHandleDraggable>
        </BlockHandlePopup>
      </BlockHandlePositioner>
    </BlockHandleRoot>
  )
}
