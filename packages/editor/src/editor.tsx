import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from './adapters/editor-adapters'
import type { OutlineOptions } from './common/outline-runtime'
import * as stylex from '@stylexjs/stylex'
import { Provider } from 'jotai'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createEditorSession } from './common/editor-session'
import { editorShellStyles } from './common/editor-shell.stylex'
import { resolveOutlineFocusTarget } from './common/outline-runtime'
import 'prosekit/basic/style.css'
import 'prosekit/basic/typography.css'
import 'katex/dist/katex.min.css'
import './styles/editor.css'

const DocumentEditor = lazy(async () => {
  const module = await import('./document/document-editor')
  return { default: module.DocumentEditor }
})

const OutlineEditor = lazy(async () => {
  const module = await import('./outline/outline-editor')
  return { default: module.OutlineEditor }
})

export type EditorMode = 'document' | 'outline'

export interface EditorProps {
  adapters: EditorAdapters
  defaultMode?: EditorMode
  initialContent?: NodeJSON
  mode?: EditorMode
  onDocumentChange?: (document: NodeJSON) => void
  onModeChange?: (mode: EditorMode) => void
  outline?: OutlineOptions
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
  const [uncontrolledMode, setUncontrolledMode] = useState<EditorMode>(props.defaultMode ?? 'document')
  const activeMode = props.mode ?? uncontrolledMode
  const controlledFocusProvided = Boolean(props.outline && Object.prototype.hasOwnProperty.call(props.outline, 'focus'))
  const controlledFocus = props.outline?.focus
  const session = useMemo(() => createEditorSession({
    adapters: props.adapters,
    initialContent: props.initialContent,
    onDocumentChange: document => onDocumentChangeRef.current?.(document),
    outline: initialOutlineOptionsRef.current,
  }), [props.adapters, props.initialContent])

  useEffect(() => {
    if (!controlledFocusProvided)
      return
    const blockId = controlledFocus ? resolveOutlineFocusTarget(session.editor.getDocJSON(), controlledFocus) : null
    session.outlineRuntime.setFocus(blockId)
  }, [controlledFocus, controlledFocusProvided, session])

  useLayoutEffect(() => {
    session.outlineRuntime.setActive(activeMode === 'outline')
  }, [activeMode, session])

  const changeMode = (nextMode: EditorMode) => {
    if (nextMode === activeMode)
      return
    if (props.mode === undefined)
      setUncontrolledMode(nextMode)
    props.onModeChange?.(nextMode)
  }

  return (
    <Provider store={session.store}>
      <div ref={rootRef} {...stylex.props(editorShellStyles.root)} data-editor-mode={activeMode}>
        <div {...stylex.props(editorShellStyles.toolbar)}>
          <div {...stylex.props(editorShellStyles.modeGroup)} aria-label="Editor mode" role="group">
            <button
              {...stylex.props(editorShellStyles.modeButton, activeMode === 'document' && editorShellStyles.modeButtonSelected)}
              aria-label="Document mode"
              aria-pressed={activeMode === 'document'}
              type="button"
              onClick={() => changeMode('document')}
            >
              Document
            </button>
            <button
              {...stylex.props(editorShellStyles.modeButton, activeMode === 'outline' && editorShellStyles.modeButtonSelected)}
              aria-label="Outline mode"
              aria-pressed={activeMode === 'outline'}
              type="button"
              onClick={() => changeMode('outline')}
            >
              Outline
            </button>
          </div>
        </div>
        <Suspense fallback={<div {...stylex.props(editorShellStyles.loading)} role="status">Loading editor mode…</div>}>
          <DocumentEditor mode={activeMode} session={session}>
            {activeMode === 'outline'
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
