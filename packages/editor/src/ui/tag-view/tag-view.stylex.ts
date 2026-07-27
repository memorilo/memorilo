import * as stylex from '@stylexjs/stylex'

const tagGreen = '#237056'
const tagSurface = '#e8f4ef'

export const tagViewStyles = stylex.create({
  control: {
    display: 'inline-flex',
    minHeight: '1.45em',
    alignItems: 'center',
    gap: 2,
    borderColor: 'transparent',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 5,
    paddingBlock: 0,
    paddingInline: 4,
    backgroundColor: tagSurface,
    color: tagGreen,
    cursor: 'text',
    font: 'inherit',
    lineHeight: 'inherit',
    outline: 'none',
    verticalAlign: 'baseline',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px color-mix(in srgb, ${tagGreen} 35%, transparent)`,
    },
  },
  selected: {
    boxShadow: `0 0 0 2px color-mix(in srgb, ${tagGreen} 28%, transparent)`,
  },
  saving: {
    opacity: 0.72,
  },
  error: {
    borderColor: '#b43b3b',
    backgroundColor: '#fff0f0',
    color: '#963333',
  },
  editor: {
    display: 'inline-flex',
    minHeight: '1.45em',
    alignItems: 'center',
    borderColor: tagGreen,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 5,
    paddingInlineStart: 4,
    backgroundColor: '#ffffff',
    color: tagGreen,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${tagGreen} 22%, transparent)`,
    verticalAlign: 'baseline',
  },
  input: {
    minWidth: '2ch',
    maxWidth: '24ch',
    borderWidth: 0,
    paddingBlock: 0,
    paddingInline: 1,
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    lineHeight: 'inherit',
    outline: 'none',
  },
  status: {
    minWidth: '1ch',
    fontSize: '0.8em',
    fontWeight: 700,
    lineHeight: 1,
    textAlign: 'center',
  },
})
