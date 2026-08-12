import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { desktopEffect, shelfEffectQuery } from './shelf-query'

export type ShelfCoverState = 'error' | 'idle' | 'loaded' | 'loading' | 'missing'

export interface ShelfCoverResult {
  imageUrl: string | null
  state: ShelfCoverState
}

function assetDataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return `data:${mimeType};base64,${btoa(binary)}`
}

export function useShelfCover(sourceId: string, coverUrl: string | null, enabled: boolean): ShelfCoverResult {
  const assetQuery = useQuery(shelfEffectQuery.queryOptions({
    enabled: enabled && coverUrl !== null,
    queryFn: () => desktopEffect(() => {
      if (coverUrl === null)
        throw new Error('Shelf cover URL is missing')
      return window.desktop.getShelfAsset({ sourceId, url: coverUrl })
    }),
    queryKey: ['shelf-asset', sourceId, coverUrl],
    retry: 1,
    staleTime: Infinity,
  }))
  const imageUrl = useMemo(() => {
    if (!assetQuery.data)
      return null
    return assetDataUrl(new Uint8Array(assetQuery.data.bytes), assetQuery.data.mimeType)
  }, [assetQuery.data])

  if (coverUrl === null)
    return { imageUrl: null, state: 'missing' }
  if (assetQuery.isError)
    return { imageUrl: null, state: 'error' }
  if (imageUrl !== null)
    return { imageUrl, state: 'loaded' }
  if (!enabled)
    return { imageUrl: null, state: 'idle' }
  return { imageUrl: null, state: 'loading' }
}
