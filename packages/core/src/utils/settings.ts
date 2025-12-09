import type { ZodObject } from 'zod'
import { Either, Option } from 'effect'
import mitt from 'mitt'
import { Disposable } from '../utils/disposable'

// eslint-disable-next-line ts/consistent-type-definitions
type SettingStoreEvents = {
  settingChanged: { key: `${string}::${string}` }
}

export class SettingStore {
  private prototype = new Map<string, ZodObject> ()
  private store = new Map<string, Record<string, unknown>> ()
  private event = mitt<SettingStoreEvents>()

  public register<T extends ZodObject>(catalogKey: string, schema: T): Either.Either<void, Error> {
    if (this.prototype.has(catalogKey)) {
      return Either.left(new Error(`Setting with key "${catalogKey}" is already registered.`))
    }
    this.prototype.set(catalogKey, schema)
    return Either.right(void 0)
  }

  public getSchema<T extends ZodObject>(catalogKey: string): Either.Either<T, Error> {
    const schema = this.prototype.get(catalogKey)
    if (!schema) {
      return Either.left(new Error(`Setting with key "${catalogKey}" is not registered.`))
    }
    return Either.right(schema as T)
  }

  public getRegisteredCatalogKeys(): string[] {
    return Array.from(this.prototype.keys())
  }

  public set<T>(key: `${string}::${string}`, value: T): Either.Either<void, Error> {
    return Either.right(key.split('::')).pipe(
      // Validate that the split resulted in exactly two parts
      Either.filterOrLeft(
        (parts: string[]): parts is [string, string] => parts.length === 2,
        () => new Error(`Invalid key format: ${key}`),
      ),
      // Validate and set the value
      Either.flatMap(([catalogKey, itemKey]) => {
        if (!this.prototype.has(catalogKey)) {
          return Either.left(new Error(`Setting with key "${catalogKey}" is not registered.`))
        }
        return this.getSchema<ZodObject<any>>(catalogKey).pipe(
          // Validate the new value against the schema
          Either.flatMap((schema) => {
            const initialValue = this.store.get(catalogKey) ?? {}
            initialValue[itemKey] = value
            const parsed = schema.safeParse(initialValue)
            if (parsed.success) {
              return Either.right(parsed.data)
            }
            else {
              return Either.left(parsed.error)
            }
          }),
          // Set the validated value in the store
          Either.map((val) => {
            this.store.set(catalogKey, val)
            this.event.emit('settingChanged', { key })
            return void 0
          }),
        )
      }),
    )
  }

  public get<T>(key: `${string}::${string}`): Either.Either<Option.Option<T>, Error> {
    return Either.right(key.split('::')).pipe(
      // Validate that the split resulted in exactly two parts
      Either.filterOrLeft(
        (parts): parts is [string, string] => parts.length === 2,
        () => new Error(`Invalid key format: ${key}`),
      ),
      // Retrieve and return the value
      Either.flatMap(([catalogKey, itemKey]) => {
        if (!this.prototype.has(catalogKey)) {
          return Either.left(new Error(`Setting with key "${catalogKey}" is not registered.`))
        }
        const catalog = this.store.get(catalogKey) ?? {}
        const value = catalog[itemKey] as T | undefined
        return Either.right(Option.fromNullable(value))
      }),
    )
  }

  public with(catalogKey: string) {
    return {
      set: <T>(itemKey: string, value: T) => this.set<T>(`${catalogKey}::${itemKey}`, value),
      get: <T>(itemKey: string) => this.get<T>(`${catalogKey}::${itemKey}`),
      watch: <T>(itemKey: string, callback: (value: Option.Option<T>) => void) => this.watch<T>(`${catalogKey}::${itemKey}`, callback),
    }
  }

  public watch<T>(key: `${string}::${string}`, callback: (value: Option.Option<T>) => void) {
    return Disposable.fromExternal((event: SettingStoreEvents['settingChanged']) => {
      const [catalogKey, itemKey] = key.split('::', 2)
      if (catalogKey === undefined || itemKey === undefined) {
        // This should not happen due to the type constraint, but we check anyway to make TypeScript Compiler happy
        throw new Error(`Invalid key format: ${key}`)
      }
      if (event.key === key) {
        const catalog = this.store.get(catalogKey) ?? {}
        const value = catalog[itemKey] as T | undefined
        callback(Option.fromNullable(value))
      }
    }, (cb) => {
      this.event.on('settingChanged', cb)
    }, (cb) => {
      this.event.off('settingChanged', cb)
    })
  }
}
