export const headingLevels = [1, 2, 3, 4, 5, 6] as const

export type HeadingLevel = (typeof headingLevels)[number]

export const headingLabelKeyByLevel: Record<HeadingLevel, string> = {
  1: 'editor.heading.level_1',
  2: 'editor.heading.level_2',
  3: 'editor.heading.level_3',
  4: 'editor.heading.level_4',
  5: 'editor.heading.level_5',
  6: 'editor.heading.level_6',
}

export const headingClassByLevel: Record<HeadingLevel, string> = {
  1: 'text-3xl',
  2: 'text-2xl',
  3: 'text-xl',
  4: 'text-lg',
  5: 'text-base',
  6: 'text-base',
}
