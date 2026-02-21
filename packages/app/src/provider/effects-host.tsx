import type { EffectItem } from '@memorilo/core/utils/effects'
import { memorilo } from '@memorilo/core'
import { useSyncExternalStore } from 'react'

function EffectRunner({ item }: { item: EffectItem }) {
  useSyncExternalStore(item.signal, item.state)
  return null
}

export function EffectsHost() {
  const items = useSyncExternalStore(
    (cb) => {
      const disposable = memorilo.effects.subscribe(cb)
      return () => disposable.dispose()
    },
    () => memorilo.effects.list(),
  )

  if (items.length === 0)
    return null

  return (
    <>
      {items.map(item => (
        <EffectRunner key={item.id} item={item} />
      ))}
    </>
  )
}
