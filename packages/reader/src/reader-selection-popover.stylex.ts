import * as stylex from '@stylexjs/stylex'
import { readerTheme } from './reader-theme.stylex'

const materializeAbove = stylex.keyframes({
  from: {
    opacity: 0.72,
    transform: 'translate(-50%, -100%) translateY(4px) scale(0.96)',
  },
  to: {
    opacity: 1,
    transform: 'translate(-50%, -100%) translateY(0) scale(1)',
  },
})

const materializeBelow = stylex.keyframes({
  from: {
    opacity: 0.72,
    transform: 'translate(-50%, 0) translateY(-4px) scale(0.96)',
  },
  to: {
    opacity: 1,
    transform: 'translate(-50%, 0) translateY(0) scale(1)',
  },
})

export const readerSelectionPopoverStyles = stylex.create({
  glassPopover: {
    position: 'fixed',
    zIndex: 40,
    maxWidth: 'calc(100vw - 24px)',
    borderColor: {
      'default': 'rgba(255, 255, 255, 0.82)',
      '@media (prefers-contrast: more)': 'rgba(35, 39, 46, 0.82)',
    },
    borderStyle: 'solid',
    borderWidth: 1,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.08)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(240, 242, 246)',
      '@media (prefers-contrast: more)': 'rgb(248, 249, 251)',
    },
    backgroundImage: 'linear-gradient(145deg, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.04) 38%, rgba(156, 166, 182, 0.08) 68%, rgba(255, 255, 255, 0.14) 100%)',
    color: 'rgba(27, 31, 38, 0.92)',
    backdropFilter: {
      'default': 'blur(12px) saturate(180%) brightness(1.03)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: {
      'default': '0 4px 12px rgba(24, 30, 40, 0.10), 0 0 0 0.5px rgba(56, 64, 77, 0.16), inset 0 1px rgba(255, 255, 255, 0.90), inset 0 -1px rgba(70, 79, 93, 0.16), inset 1px 0 rgba(255, 255, 255, 0.42), inset -1px 0 rgba(70, 79, 93, 0.08)',
      '@media (prefers-contrast: more)': '0 4px 12px rgba(22, 27, 35, 0.16), 0 0 0 1px rgba(35, 39, 46, 0.48), inset 0 1px rgba(255, 255, 255, 0.92)',
    },
    isolation: 'isolate',
    animationDuration: {
      'default': '180ms',
      '@media (prefers-reduced-motion: reduce)': '100ms',
    },
    animationFillMode: 'backwards',
    animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    willChange: 'transform, opacity',
  },
  popoverAbove: {
    transform: 'translate(-50%, -100%)',
    transformOrigin: '50% calc(100% + 10px)',
    animationName: {
      'default': materializeAbove,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  popoverBelow: {
    transform: 'translate(-50%, 0)',
    transformOrigin: '50% -10px',
    animationName: {
      'default': materializeBelow,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
  },
  selectionToolbar: {
    width: 188,
    height: 44,
    boxSizing: 'border-box',
    overflow: 'hidden',
    borderRadius: 22,
    padding: 0,
  },
  selectionToolbarCopyOnly: {
    width: 96,
  },
  selectionToolbarRegion: {
    width: 142,
  },
  selectionToolbarPalette: {
    width: 234,
  },
  paletteTool: {
    position: 'absolute',
    display: 'grid',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyItems: 'center',
    borderColor: 'transparent',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 16,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.30)',
      ':active': 'rgba(58, 66, 78, 0.14)',
      '@media (prefers-contrast: more)': 'rgba(255, 255, 255, 0.44)',
    },
    color: 'rgba(29, 34, 42, 0.88)',
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${readerTheme.focus}`,
    },
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.94)',
    },
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, color, transform',
    transitionTimingFunction: 'ease-out',
  },
  paletteClose: {
    top: 6,
    left: 6,
  },
  paletteCopy: {
    top: 6,
    left: 52,
  },
  paletteColor: {
    top: 6,
    left: 98,
  },
  paletteColorRegion: {
    left: 52,
  },
  paletteHighlight: {
    top: 6,
    left: 144,
  },
  paletteHighlightRegion: {
    left: 98,
  },
  paletteColorTool: {
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.30)',
      ':active': 'rgba(58, 66, 78, 0.14)',
    },
  },
  paletteCurrentColor: {
    width: 22,
    height: 22,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    borderStyle: 'solid',
    borderWidth: 2,
    borderRadius: 11,
    boxShadow: '0 0 0 1px rgba(38, 44, 54, 0.42)',
  },
  paletteSwatch: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: 'rgba(255, 255, 255, 0.86)',
    borderStyle: 'solid',
    borderWidth: 2,
    borderRadius: 13,
    padding: 0,
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': '0 0 0 1px rgba(38, 44, 54, 0.18)',
      ':hover': '0 0 0 2px rgba(255, 255, 255, 0.90), 0 0 0 3px rgba(38, 44, 54, 0.28)',
      ':focus-visible': `0 0 0 2px ${readerTheme.focus}`,
    },
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.92)',
    },
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'box-shadow, transform',
    transitionTimingFunction: 'ease-out',
  },
  paletteColorYellow: {
    top: 9,
    left: 48,
  },
  paletteColorGreen: {
    top: 9,
    left: 85,
  },
  paletteColorBlue: {
    top: 9,
    left: 122,
  },
  paletteColorPink: {
    top: 9,
    left: 159,
  },
  paletteColorPurple: {
    top: 9,
    left: 196,
  },
  colorGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    paddingRight: 3,
    paddingLeft: 3,
  },
  colorButton: {
    width: 20,
    height: 20,
    flexShrink: 0,
    borderColor: 'rgba(39, 44, 52, 0.16)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 999,
    padding: 0,
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': 'inset 0 1px rgba(255, 255, 255, 0.5), 0 1px 2px rgba(27, 32, 40, 0.12)',
      ':focus-visible': `0 0 0 2px ${readerTheme.focus}`,
    },
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.88)',
    },
    transitionDuration: {
      'default': '90ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'transform, box-shadow',
    transitionTimingFunction: 'ease-out',
  },
  colorButtonSelected: {
    boxShadow: '0 0 0 2px rgba(246, 248, 252, 0.96), 0 0 0 3px rgba(40, 47, 58, 0.52), inset 0 1px rgba(255, 255, 255, 0.5)',
  },
  selectionClose: {
    display: 'grid',
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyItems: 'center',
    borderWidth: 0,
    borderRadius: 17,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.30)',
      ':active': 'rgba(58, 66, 78, 0.14)',
    },
    color: 'inherit',
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${readerTheme.focus}`,
    },
  },
  noteComposer: {
    zIndex: 41,
    display: 'flex',
    width: 320,
    flexDirection: 'column',
    borderRadius: 18,
    padding: 12,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.98)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(240, 242, 246)',
      '@media (prefers-contrast: more)': 'rgb(248, 249, 251)',
    },
    backdropFilter: {
      'default': 'blur(16px) saturate(180%) brightness(1.03)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: {
      'default': '0 10px 28px rgba(25, 32, 43, 0.16), 0 2px 7px rgba(25, 32, 43, 0.08), inset 0 1px rgba(255, 255, 255, 0.92), inset 0 -1px rgba(70, 82, 101, 0.12)',
      '@media (prefers-contrast: more)': '0 10px 28px rgba(24, 30, 40, 0.22), 0 0 0 1px rgba(34, 41, 52, 0.30), inset 0 1px rgba(255, 255, 255, 0.96)',
    },
  },
  composerHeader: {
    display: 'flex',
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 2,
  },
  composerTitle: {
    fontSize: 12,
    fontWeight: 650,
    letterSpacing: 0,
    lineHeight: '17px',
  },
  composerQuote: {
    display: '-webkit-box',
    overflow: 'hidden',
    marginBottom: 7,
    borderLeftColor: 'rgba(48, 56, 68, 0.22)',
    borderLeftStyle: 'solid',
    borderLeftWidth: 2,
    paddingTop: 4,
    paddingRight: 6,
    paddingBottom: 4,
    paddingLeft: 9,
    color: 'rgba(42, 48, 58, 0.72)',
    fontSize: 10,
    lineHeight: '15px',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
  composerTextarea: {
    width: '100%',
    resize: 'none',
    borderColor: 'rgba(45, 53, 66, 0.16)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    color: 'rgba(27, 31, 38, 0.92)',
    fontFamily: 'inherit',
    fontSize: 12,
    lineHeight: '17px',
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus': `0 0 0 2px ${readerTheme.focus}, inset 0 1px rgba(255, 255, 255, 0.72)`,
    },
  },
  composerFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
})
