import type { ReactNode } from 'react'
import type { ZodType } from 'zod'
import { Either, Option } from 'effect'
import mitt from 'mitt'
import { Disposable } from '../utils/disposable'

// eslint-disable-next-line ts/consistent-type-definitions
type SettingStoreEvents = {
  settingChanged: { key: string }
}

/**
 * Describes a single configurable setting used by the application.
 *
 * @template T - The TypeScript type of the setting's value. Defaults to `any`.
 *
 * @remarks
 * Each setting is identified by a stable `key`, validated/parsed by a Zod schema,
 * and may provide a default value and an optional UI component to render and edit the value.
 *
 * @property key - A unique string identifier for the setting. Should remain stable to preserve persisted values.
 * @property schema - A Zod schema (ZodType<T>) that validates and parses the setting's value.
 * @property defaultValue - Optional fallback value used when no persisted value exists.
 * @property component - Optional React rendering/editing component for this setting. Receives an object:
 *   - value: current value of type `T`
 *   - onChange: callback to update the value (`(value: T) => void`)
 *   - schema: the same Zod schema used for validation
 *
 * @example
 * const fontSizeSetting: SettingItem<number> = {
 *   key: "editor.fontSize",
 *   schema: z.number().min(8).max(72),
 *   defaultValue: 14,
 *   component: ({ value, onChange }) => <NumberInput value={value} onChange={onChange} />
 * };
 */
export interface SettingItem<T = any> {
  key: string
  schema: ZodType<T>
  defaultValue?: T
  component?: (props: { value: T, onChange: (value: T) => void, schema: ZodType<T> }) => ReactNode
}

export class SettingStore {
  private definitions = new Map<string, Map<string, SettingItem>>()
  private values = new Map<string, Record<string, any>>()
  private event = mitt<SettingStoreEvents>()

  public register(catalogKey: string, items: SettingItem[]): Either.Either<void, Error> {
    const itemMap = this.definitions.has(catalogKey) ? this.definitions.get(catalogKey)! : new Map<string, SettingItem>()

    for (const item of items) {
      if (itemMap.has(item.key)) {
        return Either.left(new Error(`Item with key "${item.key}" is duplicated in catalog "${catalogKey}".`))
      }
      itemMap.set(item.key, item)
    }
    this.definitions.set(catalogKey, itemMap)

    // Initialize default values if not present
    if (!this.values.has(catalogKey)) {
      this.values.set(catalogKey, {})
    }
    const catalogValues = this.values.get(catalogKey)!
    for (const item of items) {
      if (item.defaultValue !== undefined && !(item.key in catalogValues)) {
        catalogValues[item.key] = item.defaultValue
      }
    }

    return Either.right(void 0)
  }

  public getDefinition(catalogKey: string, itemKey: string): Option.Option<SettingItem> {
    const catalog = this.definitions.get(catalogKey)
    if (!catalog)
      return Option.none()
    return Option.fromNullable(catalog.get(itemKey))
  }

  public getCatalogs(): string[] {
    return Array.from(this.definitions.keys())
  }

  public getCatalogItems(catalogKey: string): SettingItem[] {
    const catalog = this.definitions.get(catalogKey)
    return catalog ? Array.from(catalog.values()) : []
  }

  public set<T>(key: string, value: T): Either.Either<void, Error> {
    const parts = key.split('::')
    if (parts.length !== 2) {
      return Either.left(new Error(`Invalid key format: ${key}. Expected "catalogKey::itemKey"`))
    }
    const catalogKey = parts[0] as string
    const itemKey = parts[1] as string

    const definitionOpt = this.getDefinition(catalogKey, itemKey)
    if (Option.isNone(definitionOpt)) {
      return Either.left(new Error(`Setting item "${key}" is not registered.`))
    }
    const definition = definitionOpt.value

    const parsed = definition.schema.safeParse(value)
    if (!parsed.success) {
      return Either.left(parsed.error)
    }

    const catalogValues = this.values.get(catalogKey) ?? {}
    catalogValues[itemKey] = parsed.data
    this.values.set(catalogKey, catalogValues)

    this.event.emit('settingChanged', { key })
    return Either.right(void 0)
  }

  public get<T>(key: string): Either.Either<Option.Option<T>, Error> {
    const parts = key.split('::')
    if (parts.length !== 2) {
      return Either.left(new Error(`Invalid key format: ${key}. Expected "catalogKey::itemKey"`))
    }
    const catalogKey = parts[0] as string
    const itemKey = parts[1] as string

    if (!this.definitions.has(catalogKey)) {
      return Either.left(new Error(`Catalog "${catalogKey}" is not registered.`))
    }

    const definitionOpt = this.getDefinition(catalogKey, itemKey)
    if (Option.isNone(definitionOpt)) {
      return Either.left(new Error(`Setting item "${key}" is not registered.`))
    }

    const catalogValues = this.values.get(catalogKey)
    const value = catalogValues?.[itemKey]

    return Either.right(Option.fromNullable(value as T))
  }

  public watch<T>(key: string | `${string}::*` | `*`, callback: (value: Option.Option<T>) => void): Disposable {
    return Disposable.fromExternal((event: SettingStoreEvents['settingChanged']) => {
      const isWildcard = key === '*' || key === '*::*'
      const isCatalogWildcard = key.endsWith('::*') && event.key.startsWith(key.slice(0, -1))

      if (isWildcard || isCatalogWildcard || event.key === key) {
        const result = this.get<T>(event.key)
        if (Either.isRight(result)) {
          callback(result.right)
        }
      }
    }, (cb) => {
      this.event.on('settingChanged', cb)
    }, (cb) => {
      this.event.off('settingChanged', cb)
    })
  }

  public toJSON(): string {
    const obj: Record<string, Record<string, any>> = {}
    for (const [catalogKey, catalogValues] of this.values) {
      obj[catalogKey] = catalogValues
    }
    return JSON.stringify(obj)
  }

  public fromJSON(json: string): Either.Either<void, Error> {
    try {
      const obj = JSON.parse(json)
      if (typeof obj !== 'object' || obj === null) {
        return Either.left(new Error('Invalid JSON: root must be an object'))
      }

      for (const [catalogKey, catalogValues] of Object.entries(obj)) {
        if (typeof catalogValues !== 'object' || catalogValues === null)
          continue

        const definitionMap = this.definitions.get(catalogKey)
        const currentValues = this.values.get(catalogKey) ?? {}

        for (const [itemKey, value] of Object.entries(catalogValues as Record<string, any>)) {
          if (definitionMap) {
            const itemDef = definitionMap.get(itemKey)
            if (itemDef) {
              const parsed = itemDef.schema.safeParse(value)
              if (parsed.success) {
                currentValues[itemKey] = parsed.data
              }
              else {
                console.warn(`Invalid value for ${catalogKey}::${itemKey} in JSON`, parsed.error)
              }
            }
            else {
              currentValues[itemKey] = value
            }
          }
          else {
            currentValues[itemKey] = value
          }
        }
        this.values.set(catalogKey, currentValues)
      }
      return Either.right(void 0)
    }
    catch (e) {
      return Either.left(e instanceof Error ? e : new Error(String(e)))
    }
  }
}
