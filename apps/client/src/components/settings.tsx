import { Button } from '@memorilo/components/ui/button'
import { ScrollArea } from '@memorilo/components/ui/scroll-area'
import { Scrollspy } from '@memorilo/components/ui/scrollspy'
import { useRef } from 'react'

export function Settings() {
  const parentRef = useRef<HTMLDivElement | null>(null)
  return (
    <div className="space-y-5">
      <div className="w-full flex gap-2">
        <Scrollspy
          offset={50}
          targetRef={parentRef}
          className="flex gap-2.5"
        >
          <Button variant="secondary">Core</Button>
          <Button variant="outline">Core</Button>
        </Scrollspy>
      </div>
      <div className="w-full">
        <ScrollArea className="grow pe-5 -me-5" viewportRef={parentRef}>

        </ScrollArea>
      </div>
    </div>
  )
}
