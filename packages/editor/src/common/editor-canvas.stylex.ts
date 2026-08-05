import * as stylex from '@stylexjs/stylex'
import { editorColors } from './editor-theme.stylex'

export const editorCanvasStyles = stylex.create({
  viewport: {
    boxSizing: 'border-box',
    display: 'flex',
    width: '100%',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    flexDirection: 'column',
    backgroundColor: editorColors.canvas,
    color: '#000000',
  },
  viewportEmbedded: {
    flex: '0 0 auto',
    minHeight: 'auto',
    overflow: 'visible',
  },
  scrolling: {
    position: 'relative',
    boxSizing: 'border-box',
    width: '100%',
    minHeight: 0,
    flex: 1,
    overflowY: 'auto',
    backgroundColor: editorColors.canvas,
  },
  scrollingEmbedded: {
    flex: '0 0 auto',
    minHeight: 'auto',
    overflowY: 'visible',
  },
  content: {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '100%',
    paddingBlock: 32,
    paddingInline: 'max(4rem, calc(50% - 20rem))',
    outline: 'none',
  },
  contentEmbedded: {
    minHeight: 'auto',
    paddingTop: 8,
    paddingBottom: 12,
  },
  uploadStatus: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
    borderBottomColor: '#dce1e5',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingInline: 12,
    backgroundColor: '#edf7f2',
    color: '#225a47',
    fontSize: 13,
  },
  uploadStatusError: {
    backgroundColor: '#fff0f0',
    color: '#9e3030',
  },
  uploadStatusButton: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
  },
})
