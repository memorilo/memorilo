import * as stylex from '@stylexjs/stylex'
import inject from '@stylexjs/stylex/lib/stylex-inject'

const colors = {
  accent: '#0071E3',
  accentSoft: 'rgba(0, 113, 227, 0.12)',
  alertBackground: '#F8E4DE',
  alertBorder: '#E7B7A8',
  alertText: '#B3261E',
  background: '#FFFFFF',
  border: 'rgba(48, 46, 51, 0.13)',
  muted: 'rgba(48, 46, 51, 0.62)',
  surface: '#F8F9FB',
  surfacePressed: 'rgba(76, 84, 96, 0.10)',
} as const

// Expo DOM renders the editor inside a WebView whose body does not always
// provide a definite percentage height. These mobile-only rules make the
// height chain explicit without changing the desktop editor contract.
const mobileEditorLayoutRules = [
  '[data-mobile-editor-root] { box-sizing: border-box; display: flex; width: 100%; height: 100vh; min-height: 0; flex-direction: column; overflow: hidden; }',
  '[data-mobile-editor-root] [data-editor-layout] { min-height: 0; height: 100%; flex: 1 1 0%; overflow: hidden; }',
  '[data-mobile-editor-root] [data-editor-viewport] { min-height: 0; height: 100%; flex: 1 1 0%; overflow: hidden; }',
  '[data-mobile-editor-root] [data-editor-scroller] { display: flex; min-height: 0; flex: 1 1 0%; flex-direction: column; overflow-y: auto; -webkit-overflow-scrolling: touch; }',
  '[data-mobile-editor-root] [data-editor-content] { flex: 1 0 auto; min-height: 100%; }',
  '[data-mobile-editor-root] [data-editor-content].ProseMirror:not(:focus) .prosekit-placeholder::before { content: attr(data-placeholder); }',
]

for (const rule of mobileEditorLayoutRules)
  inject({ ltr: rule, priority: 1 })

export const editorDomSurfaceStyles = stylex.create({
  alert: {
    flexShrink: 0,
    borderBottomColor: colors.alertBorder,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: colors.alertBackground,
    color: colors.alertText,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 13,
    lineHeight: '18px',
  },
  emptyTopic: {
    display: 'grid',
    minHeight: 0,
    flex: 1,
    placeItems: 'center',
    padding: 24,
    color: colors.muted,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 14,
    textAlign: 'center',
  },
  root: {
    display: 'flex',
    width: '100%',
    height: '100vh',
    minHeight: 0,
    flexDirection: 'column',
    backgroundColor: colors.background,
  },
  rootImmersive: {
    boxSizing: 'border-box',
  },
  workspace: {
    display: 'flex',
    minHeight: 0,
    flex: 1,
    flexDirection: 'column',
  },
})
