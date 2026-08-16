import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { DesktopConfigurationSchema } from '@memorilo/desktop-config'
import { Schema } from 'effect'
import { Hono } from 'hono'
import { validator } from 'hono/validator'
import {
  decodeDesktopHonoInput,
  encodeDesktopHonoValue,
} from './wire'

const ConfigurationValueInputSchema = Schema.Struct({
  path: Schema.NonEmptyString,
  value: Schema.Unknown,
})

export interface ConfigurationRouteHandlers {
  get: () => Promise<DesktopConfiguration> | DesktopConfiguration
  set: (configuration: DesktopConfiguration) => Promise<DesktopConfiguration> | DesktopConfiguration
  setValue: (path: string, value: unknown) => Promise<DesktopConfiguration> | DesktopConfiguration
}

export function createConfigurationRoutes(handlers: ConfigurationRouteHandlers) {
  return new Hono()
    .get('/', async (context) => {
      const result = await handlers.get()
      return context.json(encodeDesktopHonoValue('configuration.get', DesktopConfigurationSchema, result))
    })
    .put('/', validator('json', value => decodeDesktopHonoInput(
      'configuration.set',
      DesktopConfigurationSchema,
      value,
    )), async (context) => {
      const input = context.req.valid('json')
      const result = await handlers.set(input)
      return context.json(encodeDesktopHonoValue('configuration.set', DesktopConfigurationSchema, result))
    })
    .patch('/value', validator('json', value => decodeDesktopHonoInput(
      'configuration.setValue',
      ConfigurationValueInputSchema,
      value,
    )), async (context) => {
      const input = context.req.valid('json')
      const result = await handlers.setValue(input.path, input.value)
      return context.json(encodeDesktopHonoValue('configuration.setValue', DesktopConfigurationSchema, result))
    })
}
