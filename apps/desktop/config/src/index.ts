import { defineConfiguration } from '@memorilo/config'
import * as Schema from 'effect/Schema'

export type {
  DesktopConfiguration,
  DesktopLanguage,
  DesktopNetworkImagePasteBehavior,
  DesktopOutdentBehavior,
  DesktopTiffConversionFormat,
} from './contract'
export { desktopConfigurationChangedChannel } from './contract'

export const defaultDesktopOutdentBehavior = 'logical' as const

export const DesktopConfigurationSchema = Schema.Struct({
  language: Schema.Literals(['system', 'en', 'zh-CN']),
  networkImagePasteBehavior: Schema.Literals(['download', 'url']),
  outdentBehavior: Schema.Literals(['logical', 'traditional']),
  reduceMotion: Schema.Boolean,
  tiffConversionFormat: Schema.Literals(['avif', 'jpeg', 'png', 'webp']),
})

export const desktopConfigurationDefinition = defineConfiguration({
  defaults: {
    language: 'system' as const,
    networkImagePasteBehavior: 'download' as const,
    outdentBehavior: defaultDesktopOutdentBehavior,
    reduceMotion: false,
    tiffConversionFormat: 'webp' as const,
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
    }, {
      control: 'select',
      description: 'Download remote image links into managed assets when pasting, or keep their original URLs.',
      label: 'Pasted network images',
      options: [
        { label: 'Download into Assets', value: 'download' },
        { label: 'Keep URL', value: 'url' },
      ],
      path: 'networkImagePasteBehavior',
    }],
    id: 'editor',
    label: 'Editor',
  }, {
    fields: [{
      control: 'select',
      description: 'TIFF images are converted to a browser-compatible format before being stored.',
      label: 'TIFF conversion format',
      options: [
        { label: 'WebP', value: 'webp' },
        { label: 'PNG', value: 'png' },
        { label: 'JPEG', value: 'jpeg' },
        { label: 'AVIF', value: 'avif' },
      ],
      path: 'tiffConversionFormat',
    }],
    id: 'images',
    label: 'Images',
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
