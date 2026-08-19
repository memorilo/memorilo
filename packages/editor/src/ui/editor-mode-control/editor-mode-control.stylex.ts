import * as stylex from '@stylexjs/stylex'

const colors = {
  accent: '#0071E3',
  border: 'rgba(48, 53, 61, 0.10)',
  control: 'rgba(68, 73, 82, 0.07)',
  controlPressed: 'rgba(68, 73, 82, 0.13)',
  selected: '#FFFFFF',
  text: '#30343B',
  textMuted: 'rgba(48, 53, 61, 0.62)',
} as const

export const editorModeControlStyles = stylex.create({
  bar: {
    display: 'flex',
    minHeight: 46,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomColor: colors.border,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingBlock: 6,
    paddingInline: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  control: {
    display: 'flex',
    width: 'min(280px, 100%)',
    height: 34,
    gap: 2,
    borderRadius: 8,
    padding: 2,
    backgroundColor: colors.control,
  },
  option: {
    display: 'flex',
    minWidth: 0,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 0,
    borderRadius: 6,
    paddingInline: 10,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.55)',
      ':active': colors.controlPressed,
    },
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${colors.accent}`,
    },
    color: colors.textMuted,
    cursor: 'default',
    font: 'inherit',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 12,
    fontWeight: 650,
    letterSpacing: 0,
    outline: 'none',
  },
  optionSelected: {
    backgroundColor: colors.selected,
    boxShadow: '0 1px 4px rgba(31, 38, 48, 0.12)',
    color: colors.text,
  },
})
