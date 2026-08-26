import * as stylex from '@stylexjs/stylex'
import { uiColors } from '../theme.stylex'

export const toolbarStyles = stylex.create({
  root: {
    display: 'flex',
    alignItems: 'center',
  },
  floating: {
    gap: 4,
    borderColor: uiColors.fieldBorder,
    borderStyle: 'solid',
    borderWidth: uiColors.surfaceStroke,
    borderRadius: uiColors.surfaceRadius,
    padding: 4,
    backgroundColor: uiColors.surfaceTranslucent,
    backdropFilter: uiColors.materialFilter,
    boxShadow: uiColors.shadowRaised,
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
