import * as stylex from '@stylexjs/stylex'
import { editorColors } from '../../common/editor-theme.stylex'

export const inlineMenuStyles = stylex.create({
  mainPopup: {
    position: 'relative',
    display: 'flex',
    minWidth: 128,
    overflow: 'auto',
    whiteSpace: 'nowrap',
  },
  linkPopup: {
    position: 'relative',
    display: 'flex',
    alignItems: 'stretch',
    width: 320,
    flexDirection: 'column',
    gap: 8,
    borderRadius: 8,
    padding: 16,
  },
  removeButton: {
    width: 'auto',
    height: 36,
    paddingInline: 12,
  },
  headingTrigger: {
    display: 'block',
  },
  headingButton: {
    minWidth: 58,
    gap: 4,
    paddingInline: 9,
  },
  headingPopup: {
    display: 'flex',
    minWidth: 160,
    overflow: 'auto',
    flexDirection: 'column',
    outline: 'none',
    userSelect: 'none',
  },
  headingItem: {
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'space-between',
    'minHeight': 34,
    'gap': 24,
    'borderRadius': 6,
    'paddingBlock': 6,
    'paddingInline': 10,
    'fontSize': 14,
    'outline': 'none',
    ':is([data-highlighted])': {
      backgroundColor: editorColors.gray100,
    },
    ':is([data-disabled="true"])': {
      opacity: 0.45,
      pointerEvents: 'none',
    },
  },
})
