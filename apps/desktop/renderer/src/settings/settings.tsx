import type { ConfigurationField, ConfigurationSection, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { TFunction } from 'i18next'
import { ConfigurationFields } from '@memorilo/config/react'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import * as stylex from '@stylexjs/stylex'
import { useTranslation } from 'react-i18next'

import { settingsStyles } from './settings.stylex'

function translateSectionLabel(sectionId: string, t: TFunction): string {
  switch (sectionId) {
    case 'general':
      return t('generalSection')
    case 'editor':
      return t('editorSection')
    default:
      return t('generalSection')
  }
}

function translateFieldLabel(field: ConfigurationField, t: TFunction): string {
  switch (field.path) {
    case 'language':
      return t('language')
    case 'reduceMotion':
      return t('reduceMotion')
    case 'outdentBehavior':
      return t('outdentBehavior')
    default:
      return field.label
  }
}

function translateFieldDescription(field: ConfigurationField, t: TFunction): string | undefined {
  if (field.path !== 'outdentBehavior')
    return field.description
  return t('outdentBehaviorDescription')
}

function translateOptionLabel(value: string, t: TFunction): string {
  switch (value) {
    case 'system':
      return t('systemDefault')
    case 'en':
      return t('english')
    case 'zh-CN':
      return t('chinese')
    case 'logical':
      return t('outdentLogical')
    case 'traditional':
      return t('outdentTraditional')
    default:
      return value
  }
}

function localizeSection(section: ConfigurationSection, t: TFunction): ConfigurationSection {
  return {
    ...section,
    description: section.description,
    label: translateSectionLabel(section.id, t),
    fields: section.fields.map((field) => {
      if (field.control === 'select') {
        return {
          ...field,
          description: translateFieldDescription(field, t),
          label: translateFieldLabel(field, t),
          options: field.options.map(option => ({
            ...option,
            label: translateOptionLabel(option.value, t),
          })),
        }
      }
      return {
        ...field,
        description: translateFieldDescription(field, t),
        label: translateFieldLabel(field, t),
      }
    }),
  }
}

export function Settings({ store }: { store: ConfigurationStore<DesktopConfiguration> }) {
  const { t } = useTranslation('settings')
  const sections = desktopConfigurationDefinition.sections.map(section => localizeSection(section, t))

  return (
    <main {...stylex.props(settingsStyles.window)}>
      <div {...stylex.props(settingsStyles.scrollArea, settingsStyles.compactPadding)}>
        <div {...stylex.props(settingsStyles.content)}>
          {sections.map(section => (
            <section key={section.id} aria-labelledby={`${section.id}-settings-heading`}>
              <h2 id={`${section.id}-settings-heading`} {...stylex.props(settingsStyles.sectionTitle)}>
                {section.label}
              </h2>
              <div {...stylex.props(settingsStyles.settingsGroup)} data-window-no-drag="">
                <ConfigurationFields fields={section.fields} store={store} />
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
