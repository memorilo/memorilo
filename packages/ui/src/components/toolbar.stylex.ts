import * as stylex from '@stylexjs/stylex'

export const toolbarStyles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
  },
  floating: {
    gap: 4,
    borderColor: 'oklch(0.928 0.006 264.531)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    backgroundColor: '#ffffff',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 10%), 0 4px 6px -4px rgb(0 0 0 / 10%)',
  },
  plain: {
    gap: 4,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
  },
})
