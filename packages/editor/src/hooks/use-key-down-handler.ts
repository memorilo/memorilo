import type { KeyboardEvent } from 'react'
import { useCallback } from 'react'
import { useSlateStatic } from 'slate-react'
import { onCodeblockExit } from './handlers/on-codeblock-exit'
import { onIndent } from './handlers/on-indent'
import { onNavigation } from './handlers/on-navigation'
import { onSoftBreak } from './handlers/on-soft-break'

export function useKeyDownHandler() {
  const editor = useSlateStatic()
  return useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const handlers = [onCodeblockExit, onIndent, onSoftBreak, onNavigation]
    for (const handler of handlers) {
      if (handler(event, editor)) {
        return
      }
    }
  }, [editor])
}
