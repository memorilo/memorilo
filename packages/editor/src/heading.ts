export const headingLevels = [1, 2, 3, 4, 5, 6] as const

export type HeadingLevel = (typeof headingLevels)[number]

export const headingLabelByLevel: Record<HeadingLevel, string> = {
  1: 'Heading 1',
  2: 'Heading 2',
  3: 'Heading 3',
  4: 'Heading 4',
  5: 'Heading 5',
  6: 'Heading 6',
}

export const headingClassByLevel: Record<HeadingLevel, string> = {
  1: 'text-3xl',
  2: 'text-2xl',
  3: 'text-xl',
  4: 'text-lg',
  5: 'text-base',
  6: 'text-base',
}
