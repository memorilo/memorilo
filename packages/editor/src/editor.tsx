import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from './adapters/editor-adapters'
import * as stylex from '@stylexjs/stylex'
import { Provider, useAtomValue, useSetAtom } from 'jotai'
import { createEditor } from 'prosekit/core'

import { ProseKit } from 'prosekit/react'
import { useMemo } from 'react'
import { createEditorExtension } from './extension/create-editor-extension'
import { sampleContent } from './sample/sample-content.ts'
import { uploadErrorAtom, uploadStatusAtom } from './state/editor-atoms'

import { createEditorStore } from './state/editor-store'
import { editorStyles } from './styles/editor.stylex'
import { BlockHandle } from './ui/block-handle/index.ts'
import { ContextMenu } from './ui/context-menu/index.ts'
import { DropIndicator } from './ui/drop-indicator/index.ts'
import { InlineMenu } from './ui/inline-menu/index.ts'
import { SlashMenu } from './ui/slash-menu/index.ts'
import { TableHandle } from './ui/table-handle/index.ts'
import { TagMenu } from './ui/tag-menu/index.ts'
import 'prosekit/basic/style.css'
import 'prosekit/basic/typography.css'
import 'katex/dist/katex.min.css'
import './styles/editor.css'

export interface EditorProps {
  adapters: EditorAdapters
  initialContent?: NodeJSON
}

function UploadStatus() {
  const status = useAtomValue(uploadStatusAtom)
  const error = useAtomValue(uploadErrorAtom)
  const setError = useSetAtom(uploadErrorAtom)

  if (status === 'idle' && !error)
    return null

  return (
    <div {...stylex.props(editorStyles.uploadStatus, Boolean(error) && editorStyles.uploadStatusError)} aria-live="polite">
      <span>{error ?? 'Uploading image...'}</span>
      {error
        ? <button {...stylex.props(editorStyles.uploadStatusButton)} aria-label="Dismiss upload error" type="button" onClick={() => setError(null)}>Dismiss</button>
        : null}
    </div>
  )
}

function EditorSurface({ adapters, initialContent, store }: EditorProps & { store: ReturnType<typeof createEditorStore> }) {
  const configured = useMemo(() => createEditorExtension(adapters, store), [adapters, store])
  const defaultContent = initialContent ?? sampleContent
  const editor = useMemo(
    () => createEditor({ extension: configured.extension, defaultContent }),
    [configured.extension, defaultContent],
  )

  return (
    <ProseKit editor={editor}>
      <div {...stylex.props(editorStyles.viewport)}>
        <UploadStatus />
        <div {...stylex.props(editorStyles.scrolling)}>
          <div ref={editor.mount} {...stylex.props(editorStyles.content)} data-editor-content="" />
          <ContextMenu uploader={configured.uploader} />
          <InlineMenu />
          <SlashMenu />
          <TagMenu runtime={configured.tagRuntime} />
          <BlockHandle />
          <TableHandle />
          <DropIndicator />
        </div>
      </div>
    </ProseKit>
  )
}

export function Editor(props: EditorProps) {
  const store = useMemo(() => createEditorStore(), [])

  return (
    <Provider store={store}>
      <EditorSurface {...props} store={store} />
    </Provider>
  )
}
