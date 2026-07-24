import * as stylex from '@stylexjs/stylex'

export const appStyles = stylex.create({
  appShell: {
    display: 'grid',
    gridTemplateColumns: '224px minmax(0, 1fr)',
    minHeight: '100vh',
  },
  sidebar: {
    borderRightColor: '#dfe2e6',
    borderRightStyle: 'solid',
    borderRightWidth: 1,
    backgroundColor: '#ffffff',
    paddingBlock: 24,
    paddingInline: 16,
  },
  brand: {
    marginBlockEnd: 28,
    marginBlockStart: 0,
    marginInline: 10,
    color: '#111318',
    fontSize: 20,
    fontWeight: 700,
  },
  navigation: {
    display: 'grid',
    gap: 4,
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
    borderRadius: 6,
    paddingInline: 10,
    color: {
      'default': '#5a606b',
      ':hover': '#16191f',
    },
    backgroundColor: {
      'default': 'transparent',
      ':hover': '#eef2f5',
    },
    textDecoration: 'none',
  },
  navLinkActive: {
    backgroundColor: '#eef2f5',
    color: '#16191f',
  },
  workspace: {
    minWidth: 0,
  },
  page: {
    minHeight: '100vh',
    paddingBlock: 40,
    paddingInline: 48,
  },
  pageNarrow: {
    maxWidth: 920,
  },
  pageHeader: {
    marginBottom: 32,
  },
  pageHeaderCompact: {
    marginBottom: 20,
  },
  pageTitle: {
    marginBlockEnd: 0,
    marginBlockStart: 4,
    fontSize: 30,
    letterSpacing: 0,
  },
  eyebrow: {
    margin: 0,
    color: '#69717d',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  status: {
    color: '#5a606b',
  },
  statusError: {
    color: '#a32d2d',
  },
  runtimeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    borderBlockColor: '#d9dde2',
    borderBlockStyle: 'solid',
    borderBlockWidth: 1,
    backgroundColor: '#ffffff',
  },
  runtimeCell: {
    padding: 22,
  },
  runtimeCellBorder: {
    borderLeftColor: '#d9dde2',
    borderLeftStyle: 'solid',
    borderLeftWidth: 1,
  },
  runtimeTerm: {
    color: '#69717d',
    fontSize: 13,
  },
  runtimeDescription: {
    marginBlockEnd: 0,
    marginBlockStart: 8,
    fontFamily: '"Cascadia Code", Consolas, monospace',
    fontSize: 17,
  },
  libraryPage: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    minHeight: 640,
  },
  memoryScroll: {
    minHeight: 0,
    flex: 1,
    overflow: 'auto',
    borderColor: '#d9dde2',
    borderStyle: 'solid',
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  memoryList: {
    position: 'relative',
    width: '100%',
  },
  memoryRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 68,
    borderBottomColor: '#e5e7ea',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingInline: 20,
  },
  memoryDate: {
    color: '#737a85',
    fontSize: 13,
  },
  editorPage: {
    height: '100vh',
    minHeight: 640,
    overflow: 'hidden',
  },
})
