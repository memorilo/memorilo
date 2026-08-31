import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  navigatorFrame: {
    borderWidth: 0,
    display: 'block',
    height: '100%',
    inset: 0,
    width: '100%',
  },
})

export const epubLayerClassNames = {
  navigatorFrame: stylex.props(styles.navigatorFrame).className ?? '',
} as const
