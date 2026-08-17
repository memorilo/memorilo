import * as stylex from '@stylexjs/stylex'

export const buttonGroupStyles = stylex.create({
  base: {
    display: 'flex',
    alignItems: 'center',
  },
  glass: {
    height: 36,
    padding: 1,
    borderColor: {
      'default': 'rgba(70, 79, 93, 0.18)',
      '@media (prefers-contrast: more)': 'rgba(35, 39, 46, 0.82)',
    },
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 18,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.08)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(240, 242, 246)',
      '@media (prefers-contrast: more)': 'rgb(248, 249, 251)',
    },
    backgroundImage: 'linear-gradient(145deg, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.04) 38%, rgba(156, 166, 182, 0.08) 68%, rgba(255, 255, 255, 0.14) 100%)',
    backdropFilter: {
      'default': 'blur(16px) saturate(180%) brightness(1.03)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: {
      'default': '0 4px 12px rgba(24, 30, 40, 0.1)',
      '@media (prefers-contrast: more)': '0 4px 12px rgba(22, 27, 35, 0.16)',
    },
  },
  toolbar: {
    gap: 2,
    borderColor: 'rgba(72, 80, 93, 0.16)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 9,
    padding: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
    boxShadow: 'inset 0 1px rgba(255, 255, 255, 0.78), 0 2px 7px rgba(31, 38, 48, 0.08)',
  },
  plain: {
    gap: 4,
  },
})
