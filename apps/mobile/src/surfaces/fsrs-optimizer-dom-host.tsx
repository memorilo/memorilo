import type { FsrsOptimizerConfiguration } from '@memorilo/srs/portable'
import type { DOMProps } from 'expo/dom'
import type {
  MobileFsrsOptimizerHandler,
  MobileFsrsOptimizerRequest,
} from '../application/mobile-fsrs-optimizer'
import type { FsrsOptimizerDomResult } from './fsrs-optimizer-dom-surface'
import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { registerMobileFsrsOptimizer } from '../application/mobile-fsrs-optimizer'
import FsrsOptimizerDomSurface from './fsrs-optimizer-dom-surface'

interface PendingRequest {
  input: MobileFsrsOptimizerRequest
  reject: (error: Error) => void
  requestId: number
  resolve: (configuration: FsrsOptimizerConfiguration) => void
}

const dom: DOMProps = {
  style: { height: 1, opacity: 0, width: 1 },
}

const styles = StyleSheet.create({
  root: {
    height: 1,
    left: 0,
    opacity: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 1,
  },
})

export function FsrsOptimizerDomHost() {
  const [request, setRequest] = useState<(MobileFsrsOptimizerRequest & { requestId: number }) | null>(null)
  const pending = useRef<PendingRequest | null>(null)
  const nextRequestId = useRef(1)

  const optimize = useCallback<MobileFsrsOptimizerHandler>((input) => {
    if (pending.current)
      return Promise.reject(new Error('FSRS parameter optimization is already running'))
    const requestId = nextRequestId.current++
    return new Promise<FsrsOptimizerConfiguration>((resolve, reject) => {
      pending.current = { input, reject, requestId, resolve }
      setRequest({ ...input, requestId })
    })
  }, [])

  const onResult = useCallback((result: FsrsOptimizerDomResult) => {
    const active = pending.current
    if (!active || active.requestId !== result.requestId)
      return
    pending.current = null
    setRequest(null)
    if (result.error)
      active.reject(new Error(result.error))
    else if (result.configuration)
      active.resolve(result.configuration)
    else
      active.reject(new Error('FSRS optimizer returned no configuration'))
  }, [])

  useEffect(() => registerMobileFsrsOptimizer(optimize), [optimize])
  useEffect(() => () => {
    const active = pending.current
    pending.current = null
    if (active)
      active.reject(new Error('FSRS optimization surface closed'))
  }, [])

  return (
    <View pointerEvents="none" style={styles.root}>
      <FsrsOptimizerDomSurface dom={dom} onResult={onResult} request={request} />
    </View>
  )
}
