import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from './adapters/editor-adapters'
import type { OutlineOptions } from './common/outline-runtime'
import type { EditorTopicDocument } from './note/editor-note'
import * as stylex from '@stylexjs/stylex'
import { Provider } from 'jotai'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { EditorMode, editorModeName } from './common/editor-mode'
import { createEditorSession } from './common/editor-session'
import { editorShellStyles } from './common/editor-shell.stylex'
import { resolveOutlineFocusTarget } from './common/outline-runtime'
import 'prosekit/basic/style.css'
import 'prosekit/basic/typography.css'
import 'katex/dist/katex.min.css'
import './common/editor-content.stylex'

const DocumentEditor = lazy(async () => {
  const module = await import('./document/document-editor')
  return { default: module.DocumentEditor }
})

const OutlineEditor = lazy(async () => {
  const module = await import('./outline/outline-editor')
  return { default: module.OutlineEditor }
})

interface EditorBaseProps {
  adapters: EditorAdapters
  focus?: EditorFocusTarget
  onDocumentChange?: (document: NodeJSON) => void
  outline?: OutlineOptions
}

export interface EditorFocusTarget {
  blockId: string
}

export interface EditorProps extends EditorBaseProps {
  topic: EditorTopicDocument
}

export function Editor(props: EditorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onDocumentChangeRef = useRef(props.onDocumentChange)
  const initialOutlineOptionsRef = useRef<OutlineOptions | undefined>(props.outline
    ? {
        defaultFocus: props.outline.defaultFocus,
        defaultOutdentBehavior: props.outline.defaultOutdentBehavior,
      }
    : undefined)
  onDocumentChangeRef.current = props.onDocumentChange
  const controlledFocusProvided = Boolean(props.outline && Object.prototype.hasOwnProperty.call(props.outline, 'focus'))
  const controlledFocus = props.outline?.focus
  const subscribeToMode = useCallback((listener: () => void) => props.topic.subscribe(listener), [props.topic])
  const getModeSnapshot = useCallback(() => props.topic.getMode(), [props.topic])
  const mode = useSyncExternalStore(subscribeToMode, getModeSnapshot, getModeSnapshot)
  const session = useMemo(() => createEditorSession({
    adapters: props.adapters,
    onDocumentChange: document => onDocumentChangeRef.current?.(document),
    outline: initialOutlineOptionsRef.current,
    topicDocument: props.topic,
  }), [props.adapters, props.topic])

  useEffect(() => {
    if (!controlledFocusProvided)
      return
    const blockId = controlledFocus ? resolveOutlineFocusTarget(session.editor.getDocJSON(), controlledFocus) : null
    session.outlineRuntime.setFocus(blockId)
  }, [controlledFocus, controlledFocusProvided, session])

  useLayoutEffect(() => {
    session.outlineRuntime.setActive(mode === EditorMode.Outline)
  }, [mode, session])

  return (
    <Provider store={session.store}>
      <div ref={rootRef} {...stylex.props(editorShellStyles.root)} data-editor-mode={editorModeName(mode)}>
        <Suspense fallback={<div {...stylex.props(editorShellStyles.loading)} role="status">Loading editor mode…</div>}>
          <DocumentEditor focusBlockId={props.focus?.blockId} mode={mode} session={session}>
            {mode === EditorMode.Outline
              ? (
                  <Suspense fallback={<div {...stylex.props(editorShellStyles.loading)} role="status">Loading Outline mode…</div>}>
                    <OutlineEditor options={props.outline} rootRef={rootRef} session={session} />
                  </Suspense>
                )
              : null}
          </DocumentEditor>
        </Suspense>
      </div>
    </Provider>
  )
}
