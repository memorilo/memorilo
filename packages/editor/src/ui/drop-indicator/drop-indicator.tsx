'use client'

import * as stylex from '@stylexjs/stylex'
import { DropIndicator as BaseDropIndicator } from 'prosekit/react/drop-indicator'

import { dropIndicatorStyles } from './drop-indicator.stylex'

export default function DropIndicator() {
  return <BaseDropIndicator {...stylex.props(dropIndicatorStyles.root)} />
}
