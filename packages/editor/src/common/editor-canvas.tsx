import type { ReactNode } from 'react'
import type { EditorModeValue } from './editor-mode'
import type { EditorSession } from './editor-session'
import * as stylex from '@stylexjs/stylex'
import i18next from 'i18next'
import { useAtomValue, useSetAtom } from 'jotai'
import { TextSelection } from 'prosekit/pm/state'
import { ProseKit } from 'prosekit/react'
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { uploadErrorAtom, uploadStatusAtom } from '../state/editor-atoms'
import { BlockHandle } from '../ui/block-handle'
import { ContextMenu } from '../ui/context-menu'
import { DropIndicator } from '../ui/drop-indicator'
import { InlineMenu } from '../ui/inline-menu'
import { SlashMenu } from '../ui/slash-menu'
import { TableHandle } from '../ui/table-handle'
import { TagMenu } from '../ui/tag-menu'
import { EditorTaskMenu } from '../ui/task-menu/editor-task-menu'
import { editorCanvasStyles } from './editor-canvas.stylex'

const CardMenu = lazy(async () => {
  const module = await import('../ui/card-menu')
  return { default: module.CardMenu }
})

const MathClozeMenu = lazy(async () => {
  const module = await import('../ui/math-cloze-menu')
  return { default: module.MathClozeMenu }
})

function selectionBlockId(selection: TextSelection): string | null {
  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const node = selection.$from.node(depth)
    if (node.type.name !== 'list')
      continue
    const blockId = node.attrs.blockId
    if (typeof blockId !== 'string' || blockId.length === 0)
      throw new Error('The focused editor Block is missing its blockId')
    return blockId
  }
  return null
}

function focusBlock(session: EditorSession, blockId: string, focusEditor: boolean): void {
  if (blockId.length === 0)
    throw new TypeError('Editor focus Block id must be a non-empty string')

  const { doc } = session.editor.state
  let blockPosition: number | undefined
  doc.descendants((node, position) => {
    if (node.type.name !== 'list' || node.attrs.blockId !== blockId)
      return true
    blockPosition = position
    return false
  })
  if (blockPosition === undefined)
    throw new Error(`Unknown editor Block id: ${blockId}`)

  const selection = TextSelection.near(doc.resolve(blockPosition + 1), 1)
  if (!(selection instanceof TextSelection))
    throw new Error(`Editor Block ${blockId} does not contain a text selection position`)
  if (selectionBlockId(selection) !== blockId)
    throw new Error(`Editor Block ${blockId} does not contain a text selection position`)

  const view = session.editor.view
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView())
  if (focusEditor)
    view.focus()
}

function UploadStatus() {
  const status = useAtomValue(uploadStatusAtom)
  const error = useAtomValue(uploadErrorAtom)
  const setError = useSetAtom(uploadErrorAtom)
  const { t } = useTranslation('editor')

  if (status === 'idle' && !error)
    return null

  return (
    <div {...stylex.props(editorCanvasStyles.uploadStatus, Boolean(error) && editorCanvasStyles.uploadStatusError)} aria-live="polite">
      <span>{error ?? t('ui.uploadingImage')}</span>
      {error
        ? <button {...stylex.props(editorCanvasStyles.uploadStatusButton)} aria-label={t('ui.dismissUploadError')} type="button" onClick={() => setError(null)}>{t('ui.dismiss')}</button>
        : null}
    </div>
  )
}

export function EditorCanvas({
  embedded,
  focusBlockId,
  mode,
  modeControls,
  readOnly,
  session,
  taskDate,
}: {
  embedded: boolean
  focusBlockId?: string
  mode: EditorModeValue
  modeControls?: ReactNode
  readOnly: boolean
  session: EditorSession
  taskDate?: string
}) {
  const { configured, editor } = session
  const { t } = useTranslation('editor')

  useLayoutEffect(() => {
    if (focusBlockId !== undefined)
      focusBlock(session, focusBlockId, !readOnly)
  }, [focusBlockId, readOnly, session])

  // The placeholder (and any other state-dependent plugin text) is evaluated on
  // every editor transaction, so it won't update until the user edits after a
  // language switch. Dispatch a no-op transaction when i18next changes language
  // so decorations re-run and pick up the newly translated strings immediately.
  useEffect(() => {
    const refresh = (): void => {
      const view = session.editor.view
      if (view)
        view.dispatch(view.state.tr)
    }
    i18next.on('languageChanged', refresh)
    return () => i18next.off('languageChanged', refresh)
  }, [session])

  return (
    <>
      {readOnly ? null : <div data-editor-mode-controls="">{modeControls}</div>}
      <ProseKit editor={editor}>
        <div {...stylex.props(editorCanvasStyles.viewport, embedded && editorCanvasStyles.viewportEmbedded)}>
          <UploadStatus />
          <div {...stylex.props(editorCanvasStyles.scrolling, embedded && editorCanvasStyles.scrollingEmbedded)}>
            <div
              ref={editor.mount}
              {...stylex.props(editorCanvasStyles.content, embedded && editorCanvasStyles.contentEmbedded)}
              aria-label={t('ui.editorContent')}
              aria-multiline={readOnly ? undefined : 'true'}
              aria-readonly={readOnly ? 'true' : undefined}
              data-editor-content=""
              role={readOnly ? 'document' : 'textbox'}
            />
            {readOnly
              ? null
              : (
                  <>
                    <ContextMenu outlineRuntime={session.outlineRuntime} uploader={configured.uploader} />
                    <EditorTaskMenu adapters={session.adapters} taskDate={taskDate} />
                    <InlineMenu learningEnabled={session.learningEnabled} />
                    {session.learningEnabled
                      ? (
                          <Suspense fallback={null}>
                            <MathClozeMenu />
                            <CardMenu adapters={session.adapters} topic={session.topicDocument} />
                          </Suspense>
                        )
                      : null}
                    <SlashMenu learningEnabled={session.learningEnabled} />
                    <TagMenu runtime={configured.tagRuntime} />
                    <BlockHandle mode={mode} session={session} />
                    <TableHandle />
                    <DropIndicator />
                  </>
                )}
          </div>
        </div>
      </ProseKit>
    </>
  )
}
