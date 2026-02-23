import type { XmlFragment } from 'yjs'
import { useSyncExternalStore } from 'react'
import { MemoriloEditor } from '../../src/editor'

export function App(props: { fragment: XmlFragment }) {
  const data = useSyncExternalStore((sub) => {
    const cb = () => sub()
    props.fragment.observeDeep(cb)
    return () => props.fragment.unobserveDeep(cb)
  }, () => props.fragment.toJSON())
  return (
    <div className="flex flex-col justify-stretch w-dvw h-dvh">
      <main className="flex justify-stretch flex-1">
        <div className="left-panel flex-1 border">
          <MemoriloEditor fragment={props.fragment} />
        </div>
        <div className="right-panel flex-1 border">
          <code className="wrap-normal overflow-y-auto">
            {data}
          </code>
        </div>
      </main>
    </div>
  )
}
