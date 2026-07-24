import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { createRuntimeInfoQueryOptions } from './runtime-query'

describe('createRuntimeInfoQueryOptions', () => {
  it('loads runtime information from the desktop bridge', async () => {
    const runtimeInfo = { platform: 'win32' as const, version: '43.2.0' }
    const queryClient = new QueryClient()
    const queryOptions = createRuntimeInfoQueryOptions({
      getRuntimeInfo: () => Promise.resolve(runtimeInfo),
    })

    await expect(queryClient.fetchQuery(queryOptions)).resolves.toEqual(runtimeInfo)
    expect(queryOptions.queryKey).toEqual(['desktop', 'runtime-info'])
  })
})
