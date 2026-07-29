import * as stylex from '@stylexjs/stylex'
import { editorColors } from '../../common/editor-theme.stylex'

export const dropIndicatorStyles = stylex.create({
  root: {
    zIndex: 50,
    backgroundColor: editorColors.blue500,
    transitionDuration: '150ms',
    transitionProperty: 'all',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
})
