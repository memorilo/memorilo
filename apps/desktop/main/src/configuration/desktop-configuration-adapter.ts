import type { ConfigurationAdapter } from '@memorilo/config'
import { join } from 'node:path'

import { createJsonFileConfigurationAdapter } from '@memorilo/config/node'
import { migrateDesktopConfiguration } from '@memorilo/desktop-config'

export function createDesktopConfigurationAdapter(userDataPath: string): ConfigurationAdapter {
  return createJsonFileConfigurationAdapter(
    join(userDataPath, 'configuration.json'),
    { migrate: migrateDesktopConfiguration },
  )
}
