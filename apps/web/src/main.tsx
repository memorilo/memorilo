import { setManagedRuntime } from '@memorilo/api-spec'
import { webRuntime } from './api/runtime'

setManagedRuntime(webRuntime)

import('@memorilo/app/main').then(({ main }) => {
  main()
})
