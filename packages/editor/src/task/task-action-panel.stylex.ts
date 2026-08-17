import * as stylex from '@stylexjs/stylex'

export const taskActionPanelStyles = stylex.create({
  panel: {
    position: 'fixed',
    zIndex: 50,
    display: 'flex',
    width: 'min(292px, calc(100vw - 16px))',
    maxHeight: 'calc(100vh - 16px)',
    boxSizing: 'border-box',
    flexDirection: 'column',
    gap: 8,
    overflowY: 'auto',
    borderColor: {
      'default': 'rgba(255, 255, 255, 0.82)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.16)',
      '@media (prefers-contrast: more)': 'currentColor',
    },
    borderRadius: 8,
    padding: 11,
    backgroundColor: {
      'default': 'rgba(247, 249, 252, 0.84)',
      '@media (prefers-color-scheme: dark)': 'rgba(35, 38, 45, 0.84)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(247, 249, 252)',
      '@media (prefers-contrast: more)': 'rgb(255, 255, 255)',
    },
    backdropFilter: {
      'default': 'blur(24px) saturate(150%) brightness(1.02)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: {
      'default': '0 18px 42px rgba(31, 38, 48, 0.2), 0 2px 8px rgba(31, 38, 48, 0.08), inset 0 1px rgba(255, 255, 255, 0.9)',
      '@media (prefers-color-scheme: dark)': '0 20px 48px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.28), inset 0 1px rgba(255, 255, 255, 0.08)',
    },
    color: {
      'default': 'rgba(25, 27, 31, 0.9)',
      '@media (prefers-color-scheme: dark)': 'rgba(248, 249, 251, 0.92)',
    },
  },
  heading: {
    color: 'inherit',
    fontSize: 12,
    fontWeight: 650,
    lineHeight: '16px',
  },
  field: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    color: {
      'default': 'rgba(48, 52, 59, 0.72)',
      '@media (prefers-color-scheme: dark)': 'rgba(235, 237, 242, 0.7)',
    },
    fontSize: 11,
    lineHeight: '16px',
  },
  input: {
    width: 72,
    height: 27,
    borderColor: {
      'default': 'rgba(72, 77, 86, 0.18)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.14)',
    },
    paddingBlock: 0,
    paddingInline: 6,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.66)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.08)',
    },
    color: 'inherit',
    fontSize: 11,
    boxShadow: {
      'default': 'none',
      ':focus-visible': '0 0 0 2px rgba(41, 97, 194, 0.62)',
    },
  },
  dateInput: {
    width: 118,
  },
  select: {
    width: 'auto',
    minWidth: 112,
    height: 27,
    borderColor: {
      'default': 'rgba(72, 77, 86, 0.18)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.14)',
    },
    paddingBlock: 0,
    paddingRight: 6,
    paddingLeft: 6,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.66)',
      '@media (prefers-color-scheme: dark)': 'rgb(55, 58, 66)',
    },
    color: 'inherit',
    fontSize: 11,
    boxShadow: {
      'default': 'none',
      ':focus-visible': '0 0 0 2px rgba(41, 97, 194, 0.62)',
    },
  },
  selectWide: {
    width: 158,
    minWidth: 158,
  },
  weekdayField: {
    display: 'grid',
    gap: 6,
  },
  weekdayLabel: {
    color: {
      'default': 'rgba(48, 52, 59, 0.72)',
      '@media (prefers-color-scheme: dark)': 'rgba(235, 237, 242, 0.7)',
    },
    fontSize: 11,
    lineHeight: '16px',
  },
  weekdayControl: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
    gap: 3,
  },
  weekdayButton: {
    'display': 'grid',
    'height': 27,
    'minWidth': 0,
    'minHeight': 27,
    'placeItems': 'center',
    'borderColor': {
      'default': 'rgba(72, 77, 86, 0.14)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.12)',
    },
    'borderStyle': 'solid',
    'borderWidth': 1,
    'borderRadius': 6,
    'padding': 0,
    'backgroundColor': {
      'default': 'rgba(255, 255, 255, 0.48)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.06)',
    },
    'color': 'inherit',
    'fontSize': 10,
    'fontWeight': 600,
    'lineHeight': '12px',
    ':hover': {
      backgroundColor: {
        'default': 'rgba(255, 255, 255, 0.82)',
        '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.12)',
      },
    },
    ':active': {
      transform: 'scale(0.96)',
    },
    ':focus-visible': {
      boxShadow: '0 0 0 2px rgba(41, 97, 194, 0.62)',
    },
  },
  weekdayButtonSelected: {
    borderColor: 'rgba(0, 113, 227, 0.28)',
    backgroundColor: {
      'default': 'rgba(0, 113, 227, 0.14)',
      '@media (prefers-color-scheme: dark)': 'rgba(40, 139, 255, 0.24)',
    },
    color: {
      'default': 'rgb(0, 94, 190)',
      '@media (prefers-color-scheme: dark)': 'rgb(112, 182, 255)',
    },
  },
  textInput: {
    width: '100%',
    height: 29,
    borderColor: {
      'default': 'rgba(72, 77, 86, 0.18)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.14)',
    },
    paddingBlock: 0,
    paddingInline: 7,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.66)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.08)',
    },
    color: 'inherit',
    fontSize: 11,
    boxShadow: {
      'default': 'none',
      ':focus-visible': '0 0 0 2px rgba(41, 97, 194, 0.62)',
    },
  },
  action: {
    'display': 'flex',
    'width': '100%',
    'height': 29,
    'minHeight': 29,
    'borderColor': {
      'default': 'rgba(255, 255, 255, 0.82)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.12)',
    },
    'borderStyle': 'solid',
    'borderWidth': 1,
    'borderRadius': 7,
    'justifyContent': 'flex-start',
    'paddingBlock': 0,
    'paddingInline': 9,
    'backgroundColor': {
      'default': 'rgba(255, 255, 255, 0.54)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.07)',
    },
    'color': 'inherit',
    'fontSize': 11,
    'fontWeight': 600,
    'textAlign': 'left',
    ':hover': {
      backgroundColor: {
        'default': 'rgba(255, 255, 255, 0.84)',
        '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.13)',
      },
    },
    ':active': {
      transform: 'scale(0.985)',
      backgroundColor: {
        'default': 'rgba(225, 230, 238, 0.78)',
        '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.17)',
      },
    },
    ':focus-visible': {
      boxShadow: '0 0 0 2px rgba(41, 97, 194, 0.62)',
    },
    ':disabled': {
      opacity: 0.5,
    },
  },
  primaryAction: {
    backgroundColor: {
      'default': 'rgba(0, 113, 227, 0.13)',
      '@media (prefers-color-scheme: dark)': 'rgba(40, 139, 255, 0.22)',
    },
    color: {
      'default': 'rgb(0, 94, 190)',
      '@media (prefers-color-scheme: dark)': 'rgb(112, 182, 255)',
    },
  },
  divider: {
    height: 1,
    backgroundColor: {
      'default': 'rgba(72, 77, 86, 0.12)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.1)',
    },
  },
  status: {
    color: {
      'default': 'rgba(48, 52, 59, 0.62)',
      '@media (prefers-color-scheme: dark)': 'rgba(235, 237, 242, 0.62)',
    },
    fontSize: 11,
    lineHeight: '15px',
  },
  error: {
    color: {
      'default': 'rgb(170, 72, 62)',
      '@media (prefers-color-scheme: dark)': 'rgb(255, 143, 132)',
    },
    fontSize: 11,
    lineHeight: '15px',
  },
})
