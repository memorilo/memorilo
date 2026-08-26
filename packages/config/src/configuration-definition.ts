import type * as Schema from 'effect/Schema'
import * as EffectSchema from 'effect/Schema'

import { getConfigurationValue } from './configuration-path'

interface ConfigurationFieldBase {
  description?: string
  label: string
  path: string
}

export interface NumberConfigurationField extends ConfigurationFieldBase {
  control: 'number'
  max?: number
  min?: number
  step?: number
  unit?: string
}

export interface SelectConfigurationField extends ConfigurationFieldBase {
  control: 'select'
  options: readonly {
    label: string
    value: string
  }[]
}

export interface SegmentedConfigurationField extends ConfigurationFieldBase {
  control: 'segmented'
  options: readonly {
    label: string
    value: string
  }[]
}

export interface TextConfigurationField extends ConfigurationFieldBase {
  control: 'text'
  placeholder?: string
  sensitive?: boolean
}

export interface ShortcutConfigurationField extends ConfigurationFieldBase {
  control: 'shortcut'
  placeholder?: string
}

export interface TimeConfigurationField extends ConfigurationFieldBase {
  control: 'time'
  max?: number
  min?: number
}

export interface ToggleConfigurationField extends ConfigurationFieldBase {
  control: 'toggle'
}

export type ConfigurationField
  = | NumberConfigurationField
    | SegmentedConfigurationField
    | SelectConfigurationField
    | TextConfigurationField
    | ShortcutConfigurationField
    | TimeConfigurationField
    | ToggleConfigurationField

export interface ConfigurationSection {
  description?: string
  fields: readonly ConfigurationField[]
  id: string
  label: string
}

export interface ConfigurationDefinition<S extends Schema.Top> {
  defaults: S['Type']
  id: string
  schema: S
  sections: readonly ConfigurationSection[]
}

const pathPattern = /^[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*$/i

function validateText(value: string, subject: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${subject} must not be empty`)
}

function validateField(field: ConfigurationField, defaults: object): void {
  validateText(field.label, `Configuration field ${field.path} label`)
  if (!pathPattern.test(field.path))
    throw new TypeError(`Invalid configuration field path: ${field.path}`)

  const value = getConfigurationValue(defaults, field.path)
  switch (field.control) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new TypeError(`Number field ${field.path} must address a finite number`)
      if (field.min !== undefined && field.max !== undefined && field.min > field.max)
        throw new RangeError(`Number field ${field.path} minimum exceeds its maximum`)
      if (field.step !== undefined && (!Number.isFinite(field.step) || field.step <= 0))
        throw new RangeError(`Number field ${field.path} step must be positive`)
      break
    }
    case 'segmented':
    case 'select': {
      const controlName = field.control === 'segmented' ? 'Segmented' : 'Select'
      if (typeof value !== 'string')
        throw new TypeError(`${controlName} field ${field.path} must address a string`)
      if (field.options.length === 0)
        throw new TypeError(`${controlName} field ${field.path} requires at least one option`)
      const values = new Set<string>()
      for (const option of field.options) {
        validateText(option.label, `${controlName} field ${field.path} option label`)
        if (values.has(option.value))
          throw new TypeError(`${controlName} field ${field.path} has duplicate option ${option.value}`)
        values.add(option.value)
      }
      if (!values.has(value))
        throw new TypeError(`${controlName} field ${field.path} does not include its default value`)
      break
    }
    case 'text':
      if (typeof value !== 'string')
        throw new TypeError(`Text field ${field.path} must address a string`)
      break
    case 'shortcut':
      if (typeof value !== 'string')
        throw new TypeError(`Shortcut field ${field.path} must address a string`)
      break
    case 'time': {
      if (typeof value !== 'number' || !Number.isInteger(value))
        throw new TypeError(`Time field ${field.path} must address an integer minute value`)
      if (value < 0 || value > 1_439)
        throw new RangeError(`Time field ${field.path} must address a time between 00:00 and 23:59`)
      if (field.min !== undefined && (!Number.isInteger(field.min) || field.min < 0 || field.min > 1_439))
        throw new RangeError(`Time field ${field.path} minimum must be between 00:00 and 23:59`)
      if (field.max !== undefined && (!Number.isInteger(field.max) || field.max < 0 || field.max > 1_439))
        throw new RangeError(`Time field ${field.path} maximum must be between 00:00 and 23:59`)
      if (field.min !== undefined && field.max !== undefined && field.min > field.max)
        throw new RangeError(`Time field ${field.path} minimum exceeds its maximum`)
      break
    }
    case 'toggle':
      if (typeof value !== 'boolean')
        throw new TypeError(`Toggle field ${field.path} must address a boolean`)
      break
  }
}

export function defineConfiguration<S extends Schema.Top & {
  readonly DecodingServices: never
  readonly Type: object
}>(
  input: ConfigurationDefinition<S>,
): ConfigurationDefinition<S> {
  validateText(input.id, 'Configuration definition id')
  const defaults = EffectSchema.decodeUnknownSync(input.schema)(input.defaults, {
    onExcessProperty: 'error',
  })
  const sectionIds = new Set<string>()
  const fieldPaths = new Set<string>()

  for (const section of input.sections) {
    validateText(section.id, 'Configuration section id')
    validateText(section.label, `Configuration section ${section.id} label`)
    if (sectionIds.has(section.id))
      throw new TypeError(`Duplicate configuration section id: ${section.id}`)
    sectionIds.add(section.id)

    for (const field of section.fields) {
      if (fieldPaths.has(field.path))
        throw new TypeError(`Duplicate configuration field path: ${field.path}`)
      validateField(field, defaults)
      fieldPaths.add(field.path)
    }
  }

  return { ...input, defaults }
}
