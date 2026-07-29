import * as stylex from '@stylexjs/stylex'
import { editorColors } from '../../common/editor-theme.stylex'

export const autocompleteMenuStyles = stylex.create({
  popup: {
    position: 'relative',
    display: 'flex',
    minWidth: 240,
    minHeight: 0,
    maxHeight: 400,
    overflow: 'hidden',
    flexDirection: 'column',
    borderRadius: 12,
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  content: {
    display: 'flex',
    minHeight: 0,
    overflowY: 'auto',
    flex: 1,
    flexDirection: 'column',
    overscrollBehavior: 'contain',
    padding: 4,
    backgroundColor: editorColors.canvas,
  },
  item: {
    'position': 'relative',
    'boxSizing': 'border-box',
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'space-between',
    'minWidth': 128,
    'borderRadius': 6,
    'paddingBlock': 6,
    'paddingInline': 12,
    'cursor': 'default',
    'fontSize': 14,
    'outline': 'none',
    'scrollMarginBlock': 4,
    'userSelect': 'none',
    'whiteSpace': 'nowrap',
    ':is([data-highlighted])': {
      backgroundColor: editorColors.gray100,
    },
  },
  keyboard: {
    color: editorColors.gray400,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    letterSpacing: 0,
  },
})
