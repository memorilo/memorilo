'use client'

import * as stylex from '@stylexjs/stylex'
import { DropIndicator as BaseDropIndicator } from 'prosekit/react/drop-indicator'

import { editorStyles } from '../../styles/editor.stylex'

export default function DropIndicator() {
  return <BaseDropIndicator {...stylex.props(editorStyles.dropIndicator)} />
}
