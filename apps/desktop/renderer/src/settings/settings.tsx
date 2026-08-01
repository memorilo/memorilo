import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { ConfigurationFields } from '@memorilo/config/react'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import * as stylex from '@stylexjs/stylex'
import { BookOpen, Globe2, Settings2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'

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

export function Settings({ store }: { store: ConfigurationStore<DesktopConfiguration> }) {
  const [activeSectionId, setActiveSectionId] = useState(desktopConfigurationDefinition.sections[0]?.id)
  const shouldReduceMotion = useReducedMotion()
  const activeSection = desktopConfigurationDefinition.sections.find(section => section.id === activeSectionId)

  if (!activeSection)
    throw new Error('Settings has no active section')

  return (
    <main {...stylex.props(settingsStyles.window)}>
      <div {...stylex.props(settingsStyles.dragRegion)} data-window-drag="" />
      <div {...stylex.props(settingsStyles.layout)}>
        <aside {...stylex.props(settingsStyles.sidebar)} aria-label="Settings categories">
          <div {...stylex.props(settingsStyles.sidebarHeader)}>
            <span {...stylex.props(settingsStyles.sidebarTitle)}>Settings</span>
          </div>
          <nav {...stylex.props(settingsStyles.navigation)} aria-label="Settings categories">
            {desktopConfigurationDefinition.sections.map((section) => {
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
                    {activeSection.id === 'general' ? 'Language and accessibility preferences.' : 'Tune the writing experience in Memorilo.'}
                  </p>
                </header>
                <div {...stylex.props(settingsStyles.settingsGroup)}>
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
