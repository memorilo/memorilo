import { defineConfiguration } from '@memorilo/config'
import * as Schema from 'effect/Schema'

export type { DesktopConfiguration, DesktopLanguage, DesktopOutdentBehavior } from './contract'
export { desktopConfigurationChangedChannel } from './contract'

export const defaultDesktopOutdentBehavior = 'logical' as const

export const DesktopConfigurationSchema = Schema.Struct({
  language: Schema.Literals(['system', 'en', 'zh-CN']),
  outdentBehavior: Schema.Literals(['logical', 'traditional']),
  reduceMotion: Schema.Boolean,
})

export const desktopConfigurationDefinition = defineConfiguration({
  defaults: {
    language: 'system' as const,
    outdentBehavior: defaultDesktopOutdentBehavior,
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
          { label: '简体中文', value: 'zh-CN' },
        ],
        path: 'language',
      },
      {
        control: 'toggle',
        label: 'Reduce motion',
        path: 'reduceMotion',
      },
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
  }],
})

export function migrateDesktopConfiguration(configuration: unknown): unknown {
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration))
    return configuration
  if (Object.prototype.hasOwnProperty.call(configuration, 'outdentBehavior'))
    return configuration
  return {
    ...configuration,
    outdentBehavior: defaultDesktopOutdentBehavior,
  }
}
