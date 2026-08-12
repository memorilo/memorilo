import type { BookReadingApplication } from './book-reading-application'
import type { DesktopIpcHandlers } from './ipc-handler-registry'
import { withIpcContext } from './ipc-handler-registry'

export function createBookHandlers(application: BookReadingApplication): DesktopIpcHandlers['books'] {
  return {
    closeReadingSession: withIpcContext((context, sessionId: string) => (
      application.closeSession(sessionId, context.sender)
    )),
    createContext: withIpcContext((context, input) => application.createContext(input, context.sender)),
    isReadingAvailable: readingId => application.isReadingAvailable(readingId),
    listContexts: readingId => application.listContexts(readingId),
    rebindContext: withIpcContext((context, input) => application.rebindContext(input, context.sender)),
    selectContext: withIpcContext((context, input) => application.selectContext(input, context.sender)),
  }
}
