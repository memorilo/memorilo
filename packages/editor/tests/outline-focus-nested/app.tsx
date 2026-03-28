import type { JSONContent } from '@tiptap/core'
import type { XmlFragment } from 'yjs'
import { Editor as TiptapEditor } from '@tiptap/core'
import { Cause, Effect, Exit, Fiber, Iterable, Option, Schedule } from 'effect'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Doc, XmlElement } from 'yjs'
import { createMemoriloEditorOptions, MemoriloEditor } from '../../src/editor'

const initialContent: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'outlineUList',
      content: [
        {
          type: 'outlineUordItem',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'aaa',
                },
              ],
            },
          ],
        },
        {
          type: 'outlineUList',
          content: [
            {
              type: 'outlineUordItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'bbb',
                    },
                  ],
                },
              ],
            },
            {
              type: 'outlineUList',
              content: [
                {
                  type: 'outlineUordItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'ccc',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'outlineUList',
          content: [
            {
              type: 'outlineUordItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'ddd',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

interface OutlineFocusNestedEnvironment {
  doc: Doc
  rootFragment: XmlFragment
}

interface FocusedFragmentResolution {
  focusNodeId: string
  fragment: XmlFragment | null
  error: string | null
}

function createOutlineFocusNestedEnvironment(): OutlineFocusNestedEnvironment {
  const doc = new Doc()
  const rootFragment = doc.getXmlFragment('doc')
  const seedEditor = new TiptapEditor({
    element: document.createElement('div'),
    ...createMemoriloEditorOptions(rootFragment),
    content: initialContent,
  })

  seedEditor.commands.setContent(initialContent)
  seedEditor.destroy()

  return { doc, rootFragment }
}

function resolveFocusedFragment(node: XmlElement): XmlFragment {
  if (node.nodeName === 'outlineUList' || node.nodeName === 'outlineOrdList') {
    return node
  }

  const parent = node.parent
  if (
    parent instanceof XmlElement
    && (parent.nodeName === 'outlineUList' || parent.nodeName === 'outlineOrdList')
  ) {
    return parent
  }

  throw new Error(`Unsupported focus root for node ${node.nodeName}`)
}

function describeFragment(fragment: XmlFragment, focusedNodeId: string | null) {
  if (fragment instanceof XmlElement) {
    return `subtree:${fragment.nodeName}:${focusedNodeId ?? 'unknown'}`
  }

  return 'document:doc'
}

function OutlineFocusNestedRoute({
  environment,
  focusNodeId,
  onOutlineClick,
  onFocusStateChange,
  onContentError,
}: {
  environment: OutlineFocusNestedEnvironment
  focusNodeId: string | null
  onOutlineClick: (id: string) => void
  onFocusStateChange: (state: string) => void
  onContentError: NonNullable<Parameters<typeof MemoriloEditor>[0]['onContentError']>
}) {
  const [focusedFragmentResolution, setFocusedFragmentResolution] = useState<FocusedFragmentResolution | null>(null)

  useEffect(() => {
    if (!focusNodeId) {
      return
    }

    const program = Effect.sync(() => {
      const walker = environment.rootFragment.createTreeWalker(
        node => node instanceof XmlElement && node.getAttribute('id') === focusNodeId,
      )
      return Iterable.head(walker)
    }).pipe(
      Effect.flatMap(Option.match({
        onNone: () => Effect.fail(`Focused outline node not found: ${focusNodeId}`),
        onSome: node => Effect.succeed(node as XmlElement),
      })),
      Effect.retry({ times: 3, schedule: Schedule.spaced(1) }),
      Effect.map(node => resolveFocusedFragment(node)),
    )

    const fiber = Effect.runFork(program)
    fiber.addObserver((exit) => {
      if (Exit.isInterrupted(exit)) {
        return
      }

      if (Exit.isSuccess(exit)) {
        setFocusedFragmentResolution({
          focusNodeId,
          fragment: exit.value,
          error: null,
        })
        return
      }

      const reason = Cause.failureOption(exit.cause).pipe(
        Option.match({
          onNone: () => 'Failed to resolve focused fragment',
          onSome: error => String(error),
        }),
      )

      setFocusedFragmentResolution({
        focusNodeId,
        fragment: null,
        error: reason,
      })
    })

    return () => {
      Effect.runFork(Fiber.interruptFork(fiber))
    }
  }, [environment.rootFragment, focusNodeId])

  const hasResolvedFocusedFragment = focusNodeId !== null && focusedFragmentResolution?.focusNodeId === focusNodeId
  const fragment = focusNodeId
    ? (hasResolvedFocusedFragment ? focusedFragmentResolution.fragment : null)
    : environment.rootFragment

  const focusState = (() => {
    if (focusNodeId === null) {
      return describeFragment(environment.rootFragment, null)
    }

    if (!hasResolvedFocusedFragment) {
      return `resolving:${focusNodeId}`
    }

    if (focusedFragmentResolution.error) {
      return `error:${focusedFragmentResolution.error}`
    }

    if (!fragment) {
      return `error:missing-fragment:${focusNodeId}`
    }

    return describeFragment(fragment, focusNodeId)
  })()

  useEffect(() => {
    onFocusStateChange(focusState)
  }, [focusState, onFocusStateChange])

  return (
    <div className="fixture-editor" data-testid="outline-focus-nested-editor">
      {fragment
        ? (
            <MemoriloEditor
              fragment={fragment}
              onOutlineClick={onOutlineClick}
              onContentError={onContentError}
            />
          )
        : (
            <div className="memorilo-editor px-8 py-4">Resolving focus...</div>
          )}
    </div>
  )
}

export function OutlineFocusNestedFixtureApp() {
  const environment = useMemo(() => createOutlineFocusNestedEnvironment(), [])
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [focusState, setFocusState] = useState('document:doc')
  const contentErrorsRef = useRef<string[]>([])
  const contentErrorsElementRef = useRef<HTMLPreElement>(null)

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Outline Focus Nested</h1>
          <OutlineFocusNestedRoute
            environment={environment}
            focusNodeId={focusedNodeId}
            onOutlineClick={setFocusedNodeId}
            onFocusStateChange={setFocusState}
            onContentError={({ error }) => {
              contentErrorsRef.current = [...contentErrorsRef.current, error.message]
              if (contentErrorsElementRef.current) {
                contentErrorsElementRef.current.textContent = JSON.stringify(contentErrorsRef.current, null, 2)
              }
            }}
          />
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">Focus State</h2>
          <pre className="fixture-pre" data-testid="outline-focus-nested-state">
            {focusState}
          </pre>
          <h2 className="fixture-label">Content Errors</h2>
          <pre className="fixture-pre" data-testid="outline-focus-nested-errors">
            <span ref={contentErrorsElementRef}>[]</span>
          </pre>
        </aside>
      </div>
    </main>
  )
}
