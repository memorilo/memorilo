import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { ConfigurationFields } from '@memorilo/config/react'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import * as stylex from '@stylexjs/stylex'

import { AssetSettings } from './asset-settings'
import { settingsStyles } from './settings.stylex'

export function Settings({ store }: { store: ConfigurationStore<DesktopConfiguration> }) {
  return (
    <main {...stylex.props(settingsStyles.window)}>
      <div {...stylex.props(settingsStyles.scrollArea, settingsStyles.compactPadding)}>
        <div {...stylex.props(settingsStyles.content)}>
          {desktopConfigurationDefinition.sections.map(section => (
            <section key={section.id} aria-labelledby={`${section.id}-settings-heading`}>
              <h2 id={`${section.id}-settings-heading`} {...stylex.props(settingsStyles.sectionTitle)}>
                {section.label}
              </h2>
              <div {...stylex.props(settingsStyles.settingsGroup)} data-window-no-drag="">
                <ConfigurationFields fields={section.fields} store={store} />
              </div>
            </section>
          ))}
          <AssetSettings />
        </div>
      </div>
    </main>
  )
}
