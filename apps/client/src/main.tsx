import { setManagedRuntime } from '@memorilo/api-spec'
import { clientRuntime } from './api/runtime'

setManagedRuntime(clientRuntime)

import('@memorilo/app/main').then(({ main }) => {
  main()
})
