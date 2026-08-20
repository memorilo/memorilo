import * as stylex from '@stylexjs/stylex'

const colors = {
  text: 'rgba(28, 28, 30, 0.94)',
  textMuted: 'rgba(60, 60, 67, 0.64)',
  textQuiet: 'rgba(60, 60, 67, 0.46)',
} as const

export const todoPlanningTaskStyles = stylex.create({
  task: {
    display: 'flex',
    width: '100%',
    minWidth: 0,
    minHeight: 62,
    alignItems: 'center',
    gap: 10,
    borderColor: {
      'default': 'rgba(72, 72, 74, 0.12)',
      '@media (prefers-reduced-transparency: reduce)': 'rgba(72, 72, 74, 0.16)',
      '@media (prefers-contrast: more)': 'rgba(35, 35, 37, 0.4)',
    },
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 10,
    boxSizing: 'border-box',
    paddingTop: 9,
    paddingRight: 44,
    paddingBottom: 9,
    paddingLeft: 9,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.82)',
      ':hover': 'rgba(255, 255, 255, 0.96)',
      ':active': 'rgba(235, 232, 244, 0.88)',
    },
    backgroundImage: 'linear-gradient(145deg, rgba(255, 255, 255, 0.72), rgba(245, 248, 252, 0.28))',
    color: colors.text,
    cursor: 'default',
    outline: 'none',
    textAlign: 'left',
    boxShadow: {
      'default': '0 4px 14px rgba(49, 42, 72, 0.08), inset 0 1px rgba(255, 255, 255, 0.96)',
      ':hover': '0 7px 20px rgba(49, 42, 72, 0.12), inset 0 1px rgba(255, 255, 255, 1)',
      ':focus-visible': '0 0 0 2px rgba(0, 122, 255, 0.72)',
    },
    transform: {
      'default': 'translateY(0) scale(1)',
      ':hover': 'translateY(-1px) scale(1)',
      ':active': 'translateY(0) scale(0.99)',
    },
    transitionDuration: {
      'default': '110ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, box-shadow, transform',
    transitionTimingFunction: 'ease-out',
    contentVisibility: 'auto',
    containIntrinsicSize: '62px',
  },
  taskSelected: {
    borderColor: 'rgba(0, 122, 255, 0.34)',
    backgroundColor: 'rgba(240, 247, 255, 0.94)',
    boxShadow: '0 0 0 1px rgba(0, 122, 255, 0.12), 0 7px 20px rgba(0, 92, 196, 0.14)',
  },
  shell: {
    position: 'relative',
    width: '100%',
    minWidth: 0,
  },
  actions: {
    position: 'absolute',
    top: '50%',
    right: 6,
    transform: 'translateY(-50%)',
  },
  icon: {
    width: 18,
    height: 18,
    flex: '0 0 18px',
    color: colors.textQuiet,
  },
  doing: {
    color: 'rgb(214, 127, 16)',
  },
  doneIcon: {
    color: 'rgb(42, 145, 87)',
  },
  content: {
    display: 'flex',
    minWidth: 0,
    flex: 1,
    flexDirection: 'column',
    gap: 3,
  },
  title: {
    overflow: 'hidden',
    color: colors.text,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: '17px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    overflow: 'hidden',
    color: colors.textQuiet,
    fontSize: 10,
    lineHeight: '14px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  done: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
})
