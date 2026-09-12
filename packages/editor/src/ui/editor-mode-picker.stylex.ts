import * as stylex from '@stylexjs/stylex'

export const editorModePickerStyles = stylex.create({
  overlay: {
    position: 'absolute',
    zIndex: 2,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    pointerEvents: 'none',
  },
  panel: {
    display: 'flex',
    maxWidth: '100%',
    gap: 12,
    pointerEvents: 'none',
  },
  button: {
    width: 128,
    height: 128,
    flexDirection: 'column',
    gap: 12,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    pointerEvents: 'auto',
  },
  icon: {
    width: 32,
    height: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: 560,
    lineHeight: '20px',
  },
})
