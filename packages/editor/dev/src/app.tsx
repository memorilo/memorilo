import type { XmlFragment } from 'yjs'
import { useMemo, useSyncExternalStore } from 'react'
import XMLBeautify from 'xml-beautify'
import { MemoriloEditor } from '../../src/editor'

export function App(props: { fragment: XmlFragment }) {
  const beautify = useMemo(() => new XMLBeautify(), [])
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
        <div className="right-panel flex-1 border overflow-auto">
          <pre>
            <code>
              {beautify.beautify(`<doc>${data}</doc>`, {
                useSelfClosingElement: true,
              })}
            </code>
          </pre>
        </div>
      </main>
    </div>
  )
}
