import type { ReactNode } from 'react'
import type { EditorSession } from './editor-session'
import * as stylex from '@stylexjs/stylex'
import { useAtomValue, useSetAtom } from 'jotai'
import { ProseKit } from 'prosekit/react'

import { uploadErrorAtom, uploadStatusAtom } from '../state/editor-atoms'
import { editorStyles } from '../styles/editor.stylex'
import { BlockHandle } from '../ui/block-handle'
import { ContextMenu } from '../ui/context-menu'
import { DropIndicator } from '../ui/drop-indicator'
import { InlineMenu } from '../ui/inline-menu'
import { SlashMenu } from '../ui/slash-menu'
import { TableHandle } from '../ui/table-handle'
import { TagMenu } from '../ui/tag-menu'

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

export function EditorCanvas({
  mode,
  modeControls,
  session,
}: {
  mode: 'document' | 'outline'
  modeControls?: ReactNode
  session: EditorSession
}) {
  const { configured, editor } = session

  return (
    <>
      <div data-editor-mode-controls="">{modeControls}</div>
      <ProseKit editor={editor}>
        <div {...stylex.props(editorStyles.viewport)}>
          <UploadStatus />
          <div {...stylex.props(editorStyles.scrolling)}>
            <div
              ref={editor.mount}
              {...stylex.props(editorStyles.content)}
              aria-label="Editor content"
              aria-multiline="true"
              data-editor-content=""
              role="textbox"
            />
            <ContextMenu uploader={configured.uploader} />
            <InlineMenu />
            <SlashMenu />
            <TagMenu runtime={configured.tagRuntime} />
            <BlockHandle mode={mode} session={session} />
            <TableHandle />
            <DropIndicator />
          </div>
        </div>
      </ProseKit>
    </>
  )
}
