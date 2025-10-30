import { Button } from '@memorilo/components/ui/button'
import { createFileRoute } from '@tanstack/react-router'
import { ask } from '@tauri-apps/plugin-dialog'
import { useState } from 'react'

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  const [option, setOption] = useState<null | 'yes' | 'no'>(null)

  function handleClick() {
    ask('Hello,World').then((value) => {
      setOption(value ? 'yes' : 'no')
    })
  }

  return (
    <div>
      { option
        && (
          <p>
            You pressed
            {' '}
            {option}
          </p>
        )}

      <Button onClick={handleClick}>Dialog</Button>

    </div>
  )
}
