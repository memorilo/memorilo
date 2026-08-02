import { defineConfiguration } from '@memorilo/config'
import * as Schema from 'effect/Schema'

export type { DesktopConfiguration, DesktopLanguage, DesktopMcpConfiguration, DesktopOutdentBehavior } from './contract'
export { desktopConfigurationChangedChannel } from './contract'

export const defaultDesktopOutdentBehavior = 'logical' as const

export const DesktopConfigurationSchema = Schema.Struct({
  language: Schema.Literals(['system', 'en', 'zh-CN']),
  mcp: Schema.Struct({
    accessToken: Schema.String,
    enabled: Schema.Boolean,
    port: Schema.Int.check(Schema.isBetween({ maximum: 65535, minimum: 1024 })),
  }),
  outdentBehavior: Schema.Literals(['logical', 'traditional']),
  reduceMotion: Schema.Boolean,
}).check(Schema.makeFilter(configuration => configuration.mcp.enabled && configuration.mcp.accessToken.length < 32
  ? { message: 'MCP requires an access token containing at least 32 characters', path: ['mcp', 'accessToken'] }
  : undefined))

export const desktopConfigurationDefinition = defineConfiguration({
  defaults: {
    language: 'system' as const,
    mcp: {
      accessToken: '',
      enabled: false,
      port: 8765,
    },
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
  }, {
    fields: [{
      control: 'toggle',
      description: 'Expose Memorilo through a local MCP server for external AI tools.',
      label: 'Enable MCP server',
      path: 'mcp.enabled',
    }, {
      control: 'number',
      description: 'Clients connect to http://127.0.0.1:<port>/mcp.',
      label: 'MCP port',
      max: 65535,
      min: 1024,
      path: 'mcp.port',
      step: 1,
    }, {
      control: 'text',
      description: 'Bearer token required by MCP clients. Keep it private.',
      label: 'MCP access token',
      path: 'mcp.accessToken',
      sensitive: true,
    }],
    id: 'mcp',
    label: 'MCP',
  }],
})

export function migrateDesktopConfiguration(configuration: unknown): unknown {
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration))
    return configuration
  const current = configuration as Record<string, unknown>
  const hasMcp = typeof current.mcp === 'object' && current.mcp !== null && !Array.isArray(current.mcp)
  const mcp = hasMcp ? current.mcp as Record<string, unknown> : {}
  const accessToken = typeof mcp.accessToken === 'string' ? mcp.accessToken : ''
  const port = typeof mcp.port === 'number'
    && Number.isSafeInteger(mcp.port)
    && mcp.port >= 1024
    && mcp.port <= 65535
    ? mcp.port
    : 8765
  const enabled = mcp.enabled === true && accessToken.length >= 32
  if (hasMcp
    && mcp.accessToken === accessToken
    && mcp.enabled === enabled
    && mcp.port === port
    && current.outdentBehavior !== undefined) {
    return configuration
  }
  return {
    ...current,
    mcp: {
      accessToken,
      enabled,
      port,
    },
    outdentBehavior: current.outdentBehavior ?? defaultDesktopOutdentBehavior,
  }
}
