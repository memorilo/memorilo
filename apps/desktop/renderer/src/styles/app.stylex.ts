import * as stylex from '@stylexjs/stylex'

export const appStyles = stylex.create({
  page: {
    minHeight: '100vh',
    paddingBlock: 40,
    paddingInline: 48,
  },
  pageHeader: {
    marginBottom: 20,
  },
  eyebrow: {
    margin: 0,
    color: '#69717d',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  pageTitle: {
    marginBlockEnd: 0,
    marginBlockStart: 4,
    fontSize: 30,
    letterSpacing: 0,
  },
  editorPage: {
    height: '100vh',
    minHeight: 640,
    overflow: 'hidden',
  },
})
