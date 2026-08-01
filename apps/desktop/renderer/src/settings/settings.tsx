import type { ConfigurationField, ConfigurationSection, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { TFunction } from 'i18next'
import { ConfigurationFields } from '@memorilo/config/react'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import * as stylex from '@stylexjs/stylex'
import { BookOpen, Globe2, Settings2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { settingsStyles } from './settings.stylex'

const sectionIcons = {
  editor: BookOpen,
  general: Settings2,
} as const

function sectionIcon(sectionId: string) {
  return sectionId in sectionIcons
    ? sectionIcons[sectionId as keyof typeof sectionIcons]
    : Globe2
}

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
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id)
  const shouldReduceMotion = useReducedMotion()
  const activeSection = sections.find(section => section.id === activeSectionId)

  if (!activeSection)
    throw new Error('Settings has no active section')

  return (
    <main {...stylex.props(settingsStyles.window)}>
      <div {...stylex.props(settingsStyles.dragRegion)} data-window-drag="" />
      <div {...stylex.props(settingsStyles.layout)}>
        <aside {...stylex.props(settingsStyles.sidebar)} aria-label={t('categories')}>
          <div {...stylex.props(settingsStyles.sidebarHeader)}>
            <span {...stylex.props(settingsStyles.sidebarTitle)}>{t('title')}</span>
          </div>
          <nav {...stylex.props(settingsStyles.navigation)} aria-label={t('categories')}>
            {sections.map((section) => {
              const Icon = sectionIcon(section.id)
              const selected = section.id === activeSection.id
              return (
                <button
                  key={section.id}
                  {...stylex.props(settingsStyles.navigationItem, selected && settingsStyles.navigationItemSelected)}
                  aria-current={selected ? 'page' : undefined}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <Icon {...stylex.props(settingsStyles.navigationIcon, selected && settingsStyles.navigationIconSelected)} aria-hidden="true" size={16} strokeWidth={2} />
                  <span>{section.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section {...stylex.props(settingsStyles.contentPane)} aria-labelledby="active-settings-heading">
          <div {...stylex.props(settingsStyles.contentScroll)}>
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activeSection.id}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -5 }}
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <header {...stylex.props(settingsStyles.contentHeader)}>
                  <h1 id="active-settings-heading" {...stylex.props(settingsStyles.pageTitle)}>{activeSection.label}</h1>
                  <p {...stylex.props(settingsStyles.pageDescription)}>
                    {activeSection.id === 'general' ? t('generalDescription') : t('editorDescription')}
                  </p>
                </header>
                <div {...stylex.props(settingsStyles.settingsGroup)} data-window-no-drag="">
                  <ConfigurationFields fields={activeSection.fields} store={store} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  )
}
