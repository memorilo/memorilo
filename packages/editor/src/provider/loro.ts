import type { LoroDocType } from 'loro-prosemirror'
import { createContext, use } from 'react'

interface LoroDocumentContextValue {
  doc: LoroDocType
}
export const LoroDocumentContext = createContext<LoroDocumentContextValue | undefined>(undefined)

export function useLoroDocument() {
  const context = use(LoroDocumentContext)
  if (!context) {
    throw new Error('useLoroDocument must be used within a LoroDocumentContext')
  }
  return context
}
