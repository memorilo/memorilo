import { protocol } from 'electron'

export interface ProtocolRegistration {
  close: () => void
}

/** Registers an Electron protocol and keeps unregistration under explicit ownership. */
export async function registerProtocol(
  scheme: string,
  handler: (request: Request) => Response | Promise<Response>,
): Promise<ProtocolRegistration> {
  await protocol.handle(scheme, handler)
  let registered = true
  return {
    close: () => {
      if (!registered)
        return
      protocol.unhandle(scheme)
      registered = false
    },
  }
}
