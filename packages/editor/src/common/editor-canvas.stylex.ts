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
    color: 'var(--ui-text, #000000)',
  },
  viewportEmbedded: {
    flex: '0 0 auto',
    minHeight: 'auto',
    overflow: 'visible',
  },
  viewportEmbeddedEmpty: {
    minHeight: 'inherit',
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
  scrollingEmbeddedEmpty: {
    minHeight: 'inherit',
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
  contentChoosingMode: {
    opacity: 0,
  },
  uploadStatus: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 34,
    borderBottomColor: 'var(--ui-divider, #dce1e5)',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingInline: 12,
    backgroundColor: 'var(--ui-surface-sunken, #edf7f2)',
    color: 'var(--ui-text, #225a47)',
    fontSize: 13,
  },
  uploadStatusError: {
    backgroundColor: 'color-mix(in srgb, var(--ui-danger, #9e3030) 10%, var(--ui-canvas, #fff))',
    color: 'var(--ui-danger, #9e3030)',
  },
  uploadStatusButton: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontWeight: 600,
  },
})
