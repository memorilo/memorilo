'use dom'

import type { FsrsOptimizerConfiguration } from '@memorilo/srs/portable'
import type { DOMProps } from 'expo/dom'
import type { MobileFsrsOptimizerRequest } from '../application/mobile-fsrs-optimizer'
import { optimizeFsrsParameters } from '@memorilo/srs'
import { useEffect } from 'react'

export interface FsrsOptimizerDomResult {
  configuration?: FsrsOptimizerConfiguration
  error?: string
  requestId: number
}

export interface FsrsOptimizerDomSurfaceProps {
  dom?: DOMProps
  onResult: (result: FsrsOptimizerDomResult) => void
  request: (MobileFsrsOptimizerRequest & { requestId: number }) | null
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export default function FsrsOptimizerDomSurface({ onResult, request }: FsrsOptimizerDomSurfaceProps) {
  useEffect(() => {
    if (!request)
      return
    let active = true
    void optimizeFsrsParameters(
      request.histories,
      request.configuration,
      request.timeoutMilliseconds,
    ).then(
      (configuration) => {
        if (active)
          onResult({ configuration, requestId: request.requestId })
      },
      (failure) => {
        if (active)
          onResult({ error: toError(failure).message, requestId: request.requestId })
      },
    )
    return () => {
      active = false
    }
  }, [onResult, request])

  return <div aria-hidden="true" />
}
