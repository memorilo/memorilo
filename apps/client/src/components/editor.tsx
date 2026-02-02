import { Skeleton } from '@memorilo/components/ui/skeleton'
import { MemoriloEditor } from '@memorilo/editor'
import { DEV } from '@memorilo/utils/constants'
import { Iterable, Option } from 'effect'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo } from 'react'
import * as Y from 'yjs'
import { useSyncYDoc } from '~/hooks/use-sync-ydoc'

interface EditorProps {
  docId: string
  focusNodeId?: string
  onOutlineClick?: (uuid: string) => void
}
export function Editor(props: EditorProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={props.docId}
        className="size-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12, ease: 'linear' }}
      >
        <EditorInstance key={props.docId} {...props} />
      </motion.div>
    </AnimatePresence>
  )
}

function EditorInstance({ docId, focusNodeId, onOutlineClick }: EditorProps) {
  const { doc, initialized, error } = useSyncYDoc(docId)

  const fragment = useMemo(() => {
    if (!initialized)
      return Option.none<Y.XmlFragment | Y.XmlElement>()
    const fragment = doc.getXmlFragment('doc')
    if (!focusNodeId) {
      return Option.some(fragment)
    }
    const walker = fragment.createTreeWalker(
      elem =>
        elem instanceof Y.XmlElement && elem.getAttribute('uuid') === focusNodeId,
    )
    return Iterable.head(walker).pipe(Option.map(e => e as Y.XmlElement))
  }, [doc, focusNodeId, initialized])

  // Debug only
  // Mount Y.Doc to window for easy access in devtools
  if (DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const global = window as any
      const id = `doc${docId.replaceAll('-', '_')}`
      if (!global.doc) {
        global.doc = {}
      }
      global.doc[id] = doc
      return () => {
        delete global.doc[id]
      }
    }, [doc, docId])
  }

  if (error) {
    return (
      <div className="px-2 py-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (!initialized) {
    return (
      <div className="px-2 py-6 space-y-2.5">
        <Skeleton className="w-full h-4" />
        <Skeleton className="w-full h-4" />
        <Skeleton className="w-1/2 h-4" />
        <Skeleton className="w-1/4 h-4" />
      </div>
    )
  }

  if (Option.isNone(fragment)) {
    return (
      <div className="px-2 py-6">
        <p className="text-sm text-destructive">
          Node not found:
          {docId}
          /
          {focusNodeId}
        </p>
      </div>
    )
  }

  const rootNode = (() => {
    if (!focusNodeId) {
      return 'doc' as const
    }
    const rootElement = fragment.value as Y.XmlElement
    const rawName = rootElement.nodeName
    const normalized = typeof rawName === 'string' ? rawName.toLowerCase() : rawName
    if (normalized === 'ordereditem') {
      return 'orderedItem' as const
    }
    if (normalized === 'taskitem' || normalized === 'todoitem') {
      return 'taskItem' as const
    }
    return 'listItem' as const
  })()

  return (
    <MemoriloEditor
      fragment={fragment.value}
      rootNode={rootNode}
      onOutlineClick={onOutlineClick}
    />
  )
}
