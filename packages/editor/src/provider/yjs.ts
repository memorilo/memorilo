import type { XmlElement, XmlFragment } from 'yjs'
import { createContext, use } from 'react'

interface YjsDocumentContextValue {
  fragment: XmlFragment | XmlElement
}

export const YjsDocumentContext = createContext<YjsDocumentContextValue | undefined>(undefined)

export function useYjsDocument() {
  const context = use(YjsDocumentContext)
  if (!context) {
    throw new Error('useYjsDocument must be used within a YjsDocumentContext')
  }
  return context
}
