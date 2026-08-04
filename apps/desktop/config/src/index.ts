import { defineConfiguration } from '@memorilo/config'
import * as Schema from 'effect/Schema'

export type { DesktopConfiguration, DesktopLanguage, DesktopOutdentBehavior } from './contract'
export { desktopConfigurationChangedChannel } from './contract'

export const defaultDesktopOutdentBehavior = 'logical' as const

export const DesktopConfigurationSchema = Schema.Struct({
  language: Schema.Literals(['system', 'en', 'zh-CN']),
  outdentBehavior: Schema.Literals(['logical', 'traditional']),
  readerArrowKeyPageTurning: Schema.Boolean,
  reduceMotion: Schema.Boolean,
})

export const desktopConfigurationDefinition = defineConfiguration({
  defaults: {
    language: 'system' as const,
    outdentBehavior: defaultDesktopOutdentBehavior,
    readerArrowKeyPageTurning: true,
    reduceMotion: false,
  },
  id: 'memorilo-desktop',
  schema: DesktopConfigurationSchema,
  sections: [{
    fields: [
      {
        control: 'select',
        label: 'Language',
        options: [
          { label: 'System Default', value: 'system' },
          { label: 'English', value: 'en' },
          { label: 'Simplified Chinese', value: 'zh-CN' },
        ],
        path: 'language',
      },
      { control: 'toggle', label: 'Reduce motion', path: 'reduceMotion' },
    ],
    id: 'general',
    label: 'General',
  }, {
    fields: [{
      control: 'select',
      description: 'Choose how Shift-Tab moves selected blocks in Outline mode.',
      label: 'Outdent behavior',
      options: [
        { label: 'Logical', value: 'logical' },
        { label: 'Traditional', value: 'traditional' },
      ],
      path: 'outdentBehavior',
    }],
    id: 'editor',
    label: 'Editor',
  }, {
    fields: [{
      control: 'toggle',
      description: 'At a page boundary, use the arrow keys to continue to the previous or next page.',
      label: 'Turn pages with arrow keys',
      path: 'readerArrowKeyPageTurning',
    }],
    id: 'reading',
    label: 'Reading',
  }],
})

export function migrateDesktopConfiguration(configuration: unknown): unknown {
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration))
    return configuration
  const record = configuration as Record<string, unknown>
  const hasOutdentBehavior = Object.prototype.hasOwnProperty.call(record, 'outdentBehavior')
  const hasReaderArrowKeyPageTurning = Object.prototype.hasOwnProperty.call(record, 'readerArrowKeyPageTurning')
  if (hasOutdentBehavior && hasReaderArrowKeyPageTurning)
    return configuration
  return {
    ...record,
    outdentBehavior: hasOutdentBehavior
      ? record.outdentBehavior
      : defaultDesktopOutdentBehavior,
    readerArrowKeyPageTurning: hasReaderArrowKeyPageTurning
      ? record.readerArrowKeyPageTurning
      : true,
  }
}
