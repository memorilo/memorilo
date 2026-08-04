import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { ConfigurationFields } from '@memorilo/config/react'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import * as stylex from '@stylexjs/stylex'
import { BookOpenText, Languages, Settings2 } from 'lucide-react'
import { useState } from 'react'

import { settingsStyles } from './settings.stylex'

const sectionIcons = { editor: BookOpenText, general: Settings2, reading: BookOpenText } as const

export function Settings({ store }: { store: ConfigurationStore<DesktopConfiguration> }) {
  const sections = desktopConfigurationDefinition.sections
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id)
  const activeSection = sections.find(section => section.id === activeSectionId)
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
            {sections.map((section) => {
              const Icon = sectionIcons[section.id as keyof typeof sectionIcons] ?? Languages
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
            <header {...stylex.props(settingsStyles.contentHeader)}>
              <h1 id="active-settings-heading" {...stylex.props(settingsStyles.pageTitle)}>{activeSection.label}</h1>
              <p {...stylex.props(settingsStyles.pageDescription)}>
                {activeSection.id === 'reading'
                  ? 'Control how the reader responds to keyboard navigation.'
                  : `Configure Memorilo ${activeSection.label.toLowerCase()} behavior.`}
              </p>
            </header>
            <div {...stylex.props(settingsStyles.settingsGroup)} data-window-no-drag="">
              <ConfigurationFields fields={activeSection.fields} store={store} />
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
