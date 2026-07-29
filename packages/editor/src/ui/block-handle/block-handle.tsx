'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import type { EditorSession } from '../../common/editor-session'
import * as stylex from '@stylexjs/stylex'
import { GripVertical, Plus } from 'lucide-react'
import { BlockHandleDraggable, BlockHandlePopup, BlockHandlePositioner, BlockHandleRoot } from 'prosekit/react/block-handle'
import { useRef } from 'react'

import { insertBlockSiblingAfter } from '../../common/block-sibling'
import { OUTLINE_LIST_KIND } from '../../common/outline-document'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import { blockHandleStyles } from './block-handle.stylex'

interface Props {
  dir?: 'ltr' | 'rtl'
  mode: 'document' | 'outline'
  session: EditorSession
}

export default function BlockHandle(props: Props) {
  const hoveredBlockRef = useRef<Parameters<typeof insertBlockSiblingAfter>[2] | null>(null)

  const addBlock = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const target = hoveredBlockRef.current
    if (!target)
      return
    const kind = props.mode === 'document' ? OUTLINE_LIST_KIND : target.node.attrs.kind
    if (typeof kind !== 'string')
      throw new Error('The hovered Outline block is missing its list kind')
    const view = props.session.editor.view
    insertBlockSiblingAfter(view.state, view.dispatch, target, kind)
    props.session.editor.focus()
  }

  return (
    <BlockHandleRoot onStateChange={(event) => { hoveredBlockRef.current = event.detail }}>
      <BlockHandlePositioner
        {...stylex.props(floatingSurfaceStyles.positioner)}
        placement={props.dir === 'rtl' ? 'right' : 'left'}
      >
        <BlockHandlePopup {...stylex.props(floatingSurfaceStyles.motion, blockHandleStyles.popup)}>
          <button {...stylex.props(blockHandleStyles.button)} aria-label="Add block" type="button" onPointerDown={addBlock}><Plus size={20} /></button>
          <BlockHandleDraggable {...stylex.props(blockHandleStyles.button, blockHandleStyles.dragButton)} aria-label="Drag block"><GripVertical size={20} /></BlockHandleDraggable>
        </BlockHandlePopup>
      </BlockHandlePositioner>
    </BlockHandleRoot>
  )
}
