import type { AddShelfSourceInput, ShelfSource, UpdateShelfSourceInput } from '@memorilo/shelf'
import type { Ref } from 'react'
import type { ShelfSearch } from '../shelf-page'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useReducedMotion } from 'motion/react'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { desktopEffect, shelfEffectQuery, shelfErrorMessage } from '../shelf-query'
import { SourceManagerSheet } from './shelf-source-manager-sheet'
import { RemoveSourceSheet } from './shelf-source-remove-sheet'

export interface ShelfSourceManagementHandle {
  openAdd: () => void
  openManagerAfterMenu: () => void
}

interface ShelfSourceManagementProps {
  pushSearch: (search: ShelfSearch) => Promise<void>
  replaceSearch: (search: ShelfSearch) => Promise<void>
  ref?: Ref<ShelfSourceManagementHandle>
  routeSearch: ShelfSearch
  selectedSourceId: string | null
  sources: readonly ShelfSource[]
}

export function ShelfSourceManagement({
  pushSearch,
  ref,
  replaceSearch,
  routeSearch,
  selectedSourceId,
  sources,
}: ShelfSourceManagementProps) {
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const openTimerRef = useRef<number | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [managerInitialMode, setManagerInitialMode] = useState<'add' | 'list'>('list')
  const [removingSource, setRemovingSource] = useState<ShelfSource | null>(null)
  const addMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (input: AddShelfSourceInput) => desktopEffect('shelf.add-source', () => window.desktop.addShelfSource(input)),
    mutationKey: ['shelf-add-source'],
    onSuccess: async (source) => {
      await queryClient.invalidateQueries({ queryKey: ['shelf-sources'] })
      await queryClient.invalidateQueries({ queryKey: ['shelf-view'] })
      await pushSearch({ source: source.id })
    },
  }))
  const updateMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (input: UpdateShelfSourceInput) => desktopEffect('shelf.update-source', () => window.desktop.updateShelfSource(input)),
    mutationKey: ['shelf-update-source'],
    onSuccess: async () => {
      await replaceSearch({ ...routeSearch, page: undefined })
      await queryClient.invalidateQueries({ queryKey: ['shelf-sources'] })
      await queryClient.invalidateQueries({ queryKey: ['shelf-view'] })
    },
  }))
  const removeMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (sourceId: string) => desktopEffect('shelf.remove-source', () => window.desktop.removeShelfSource(sourceId)),
    mutationKey: ['shelf-remove-source'],
    onSuccess: async (_, sourceId) => {
      if (selectedSourceId === sourceId)
        await pushSearch({})
      setRemovingSource(null)
      await queryClient.invalidateQueries({ queryKey: ['shelf-sources'] })
      await queryClient.invalidateQueries({ queryKey: ['shelf-view'] })
    },
  }))

  const open = (mode: 'add' | 'list') => {
    addMutation.reset()
    updateMutation.reset()
    setManagerInitialMode(mode)
    setManagerOpen(true)
  }

  useEffect(() => () => {
    if (openTimerRef.current !== null)
      window.clearTimeout(openTimerRef.current)
  }, [])

  useImperativeHandle(ref, () => ({
    openAdd: () => open('add'),
    openManagerAfterMenu: () => {
      if (openTimerRef.current !== null)
        window.clearTimeout(openTimerRef.current)
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null
        open('list')
      }, shouldReduceMotion ? 0 : 180)
    },
  }))

  return createPortal(
    <>
      {managerOpen
        ? (
            <SourceManagerSheet
              addErrorMessage={shelfErrorMessage(addMutation.error)}
              initialMode={managerInitialMode}
              isPending={addMutation.isPending || updateMutation.isPending}
              open
              sources={sources}
              updateErrorMessage={shelfErrorMessage(updateMutation.error)}
              onAdd={async (input) => {
                await addMutation.mutateAsync(input)
              }}
              onClose={() => setManagerOpen(false)}
              onRemove={(source) => {
                setManagerOpen(false)
                setRemovingSource(source)
              }}
              onUpdate={async (input) => {
                await updateMutation.mutateAsync(input)
              }}
            />
          )
        : null}
      <RemoveSourceSheet
        isPending={removeMutation.isPending}
        source={removingSource}
        onCancel={() => {
          if (!removeMutation.isPending)
            setRemovingSource(null)
        }}
        onConfirm={() => {
          if (removingSource)
            removeMutation.mutate(removingSource.id)
        }}
      />
    </>,
    document.body,
  )
}
