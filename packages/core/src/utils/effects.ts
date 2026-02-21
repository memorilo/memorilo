import mitt from 'mitt'
import { Disposable } from './disposable'

export type EffectSignalSubscriber = () => void

export interface EffectItem<T = unknown> {
  id: string
  signal: (cb: EffectSignalSubscriber) => () => void
  state: () => T
}

// eslint-disable-next-line ts/consistent-type-definitions
type EffectsEvents = {
  changed: void
}

export class EffectsRegistry {
  private items = new Map<string, EffectItem>()
  private listCache: EffectItem[] = []
  private event = mitt<EffectsEvents>()

  public register(items: EffectItem[]): void {
    let changed = false

    for (const item of items) {
      const existing = this.items.get(item.id)
      if (existing !== item) {
        this.items.set(item.id, item)
        changed = true
      }
    }

    if (changed) {
      this.listCache = Array.from(this.items.values())
      this.event.emit('changed')
    }
  }

  public list(): EffectItem[] {
    return this.listCache
  }

  public subscribe(cb: () => void): Disposable {
    return Disposable.fromExternal((_event: EffectsEvents['changed']) => {
      cb()
    }, (handler) => {
      this.event.on('changed', handler)
    }, (handler) => {
      this.event.off('changed', handler)
    })
  }
}
