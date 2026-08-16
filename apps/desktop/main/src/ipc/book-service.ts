import type { DesktopRequestHandlers } from '../desktop-request-handlers'
import type { BookReadingApplication } from './book-reading-application'
import { withDesktopRequestContext } from '../desktop-request-handlers'

export function createBookHandlers(application: BookReadingApplication): DesktopRequestHandlers['books'] {
  return {
    closeReadingSession: withDesktopRequestContext((context, sessionId: string) => (
      application.closeSession(sessionId, context.sender)
    )),
    createContext: withDesktopRequestContext((context, input) => application.createContext(input, context.sender)),
    isReadingAvailable: readingId => application.isReadingAvailable(readingId),
    listContexts: readingId => application.listContexts(readingId),
    rebindContext: withDesktopRequestContext((context, input) => application.rebindContext(input, context.sender)),
    selectContext: withDesktopRequestContext((context, input) => application.selectContext(input, context.sender)),
  }
}
