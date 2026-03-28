import { Skeleton } from '@memorilo/components/ui/skeleton'
import { MemoriloEditor } from '@memorilo/editor'
import { DEV } from '@memorilo/utils/constants'
import { Cause, Effect, Exit, Fiber, Option, Schedule } from 'effect'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useState } from 'react'
import * as Y from 'yjs'
import { useSyncYDoc } from '~/hooks/use-sync-ydoc'

interface EditorProps {
  docId: string
  focusNodeId?: string
  onOutlineClick?: (id: string) => void
}

interface FocusedFragmentResolution {
  doc: Y.Doc
  focusNodeId: string
  status: 'pending' | 'resolved' | 'error'
  fragment: Y.XmlFragment | null
  error: string | null
}

function findFocusedNodeById(rootFragment: Y.XmlFragment, targetId: string) {
  const walker = rootFragment.createTreeWalker(
    node => node instanceof Y.XmlElement && node.getAttribute('id') === targetId,
  )
  const next = walker[Symbol.iterator]().next()
  return next.done ? null : (next.value as Y.XmlElement)
}

function resolveFocusedFragment(node: Y.XmlElement) {
  if (node.nodeName === 'outlineUList' || node.nodeName === 'outlineOrdList') {
    return node
  }

  const parent = node.parent
  if (
    parent instanceof Y.XmlElement
    && (parent.nodeName === 'outlineUList' || parent.nodeName === 'outlineOrdList')
  ) {
    return parent
  }

  throw new Error(`Unsupported focus root for node ${node.nodeName}`)
}

export function Editor(props: EditorProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={props.docId}
        className="size-full overflow-y-auto"
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
  const { doc, initialized: docInitialized, error } = useSyncYDoc(docId)
  const rootFragment = doc.getXmlFragment('doc')
  const [focusedFragmentResolution, setFocusedFragmentResolution] = useState<FocusedFragmentResolution | null>(null)
  const hasCurrentFocusedFragmentResolution = focusedFragmentResolution?.doc === doc
    && focusedFragmentResolution.focusNodeId === focusNodeId
  const fragment = focusNodeId
    ? (hasCurrentFocusedFragmentResolution && focusedFragmentResolution?.status === 'resolved'
        ? focusedFragmentResolution.fragment
        : null)
    : rootFragment
  const fragmentError = focusNodeId && hasCurrentFocusedFragmentResolution && focusedFragmentResolution?.status === 'error'
    ? focusedFragmentResolution.error
    : null
  const initialized = docInitialized && (!focusNodeId || (
    hasCurrentFocusedFragmentResolution && focusedFragmentResolution?.status !== 'pending'
  ))

  useLayoutEffect(() => {
    if (!focusNodeId) {
      return
    }

    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setFocusedFragmentResolution({
      doc,
      focusNodeId,
      status: 'pending',
      fragment: null,
      error: null,
    })
  }, [doc, focusNodeId])

  useEffect(() => {
    if (!focusNodeId) {
      return
    }

    const rootFragment = doc.getXmlFragment('doc')
    const program = Effect.sync(() => findFocusedNodeById(rootFragment, focusNodeId)).pipe(
      Effect.flatMap(node =>
        node === null
          ? Effect.fail(new Error('Node not found'))
          : Effect.try({
              try: () => resolveFocusedFragment(node),
              catch: cause => cause instanceof Error ? cause : new Error(String(cause)),
            })),
      Effect.retry({ times: 5, schedule: Schedule.spaced(1000) }),
    )

    let active = true
    const fiber = Effect.runFork(program)
    fiber.addObserver((exit) => {
      if (!active || Exit.isInterrupted(exit)) {
        return
      }

      if (Exit.isSuccess(exit)) {
        setFocusedFragmentResolution({
          doc,
          focusNodeId,
          status: 'resolved',
          fragment: exit.value,
          error: null,
        })
        return
      }

      if (Exit.isFailure(exit)) {
        const error = Cause.failureOption(exit.cause).pipe(
          Option.match({
            onNone: () => 'Failed to resolve focused fragment',
            onSome: failure => failure instanceof Error ? failure.message : String(failure),
          }),
        )
        setFocusedFragmentResolution({
          doc,
          focusNodeId,
          status: 'error',
          fragment: null,
          error,
        })
      }
    })

    return () => {
      active = false
      Effect.runFork(Fiber.interruptFork(fiber))
    }
  }, [doc, focusNodeId])

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

  if (fragmentError) {
    return (
      <div className="px-2 py-6">
        <p className="text-sm text-destructive">{fragmentError}</p>
      </div>
    )
  }
  if (!fragment) {
    throw new Error('Editor fragment must be resolved before rendering MemoriloEditor')
  }

  return (
    <MemoriloEditor
      fragment={fragment}
      onOutlineClick={onOutlineClick}
    />
  )
}
