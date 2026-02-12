import { Input } from '@memorilo/components/ui/input'
import { useState } from 'react'
import { useDocTitle, useMutateDocTitle } from '~/hooks/api'

interface DocTitleInputProps {
  docId: string
  readOnly?: boolean
  containerClassName?: string
  size?: 'default' | 'compact'
}

export function DocTitleInput({ docId, readOnly = false, containerClassName, size = 'default' }: DocTitleInputProps) {
  const titleQuery = useDocTitle(docId)
  const mutateTitle = useMutateDocTitle()
  const [editing, setEditing] = useState<{ active: boolean, value: string }>({ active: false, value: '' })

  const currentTitle = titleQuery.data ?? ''
  const value = editing.active ? editing.value : currentTitle
  const titleSizeClass = size === 'compact' ? '!text-xl' : '!text-2xl'
  const titleLeadingClass = size === 'compact' ? 'leading-tight' : ''

  const commitTitle = (nextTitle: string) => {
    if (readOnly || titleQuery.status !== 'success') {
      return
    }
    if (nextTitle !== titleQuery.data) {
      mutateTitle.mutate({ docId, title: nextTitle })
    }
  }

  return (
    <div className={containerClassName ?? 'px-8 pt-4 pb-2'}>
      <Input
        value={value}
        onFocus={() => {
          if (readOnly || editing.active) {
            return
          }
          setEditing({ active: true, value: currentTitle })
        }}
        onChange={(event) => {
          if (!readOnly) {
            const nextValue = event.currentTarget.value
            setEditing({ active: true, value: nextValue })
          }
        }}
        onBlur={(event) => {
          if (!readOnly) {
            commitTitle(event.currentTarget.value)
          }
          setEditing({ active: false, value: '' })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        placeholder="Untitled"
        readOnly={readOnly}
        className={`h-auto rounded-none border-0 bg-transparent px-0 py-0 ${titleSizeClass} ${titleLeadingClass} font-semibold shadow-none focus-visible:border-transparent focus-visible:ring-0`}
      />
    </div>
  )
}
