import type { NodeJSON } from 'prosekit/core'
import type { Uploader } from 'prosekit/extensions/file'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { CardReviewRuntime } from '../card/card-review-runtime'
import type { OutlineRuntime } from '../common/outline-runtime'
import type { EditorTopicRuntime } from '../note/editor-topic-runtime'
import type { EditorStore } from '../state/editor-store'
import {
  LoroTreeEphemeralCursorPlugin,
  LoroTreeSyncPlugin,
  LoroTreeUndoPlugin,
  redo,
  undo,
} from '@memorilo/loro-prosemirror-tree'
import i18next from 'i18next'
import { defineBasicExtension } from 'prosekit/basic'
import {
  defineCommands,
  defineDocChangeHandler,
  defineKeymap,
  definePlugin,
  isApple,
  Priority,
  union,
  withPriority,
} from 'prosekit/core'
import { defineCodeBlockShiki } from 'prosekit/extensions/code-block'
import { defineHorizontalRule } from 'prosekit/extensions/horizontal-rule'
import { defineImageUploadHandler } from 'prosekit/extensions/image'
import { defineMath } from 'prosekit/extensions/math'
import { definePlaceholder } from 'prosekit/extensions/placeholder'
import { defineReadonly } from 'prosekit/extensions/readonly'
import { defineCardExtension } from '../card/card-extension'
import { defineCardReviewExtension } from '../card/card-review-extension'
import { defineBlockIdExtension } from '../common/block-id-extension'
import { defineEditorKeymapExtension } from '../common/editor-keymap-extension'
import { defineOutlineKeymapExtension } from '../common/outline-keymap-extension'
import { defineOutlineViewExtension } from '../common/outline-view-extension'
import { defineTableKeymapExtension } from '../common/table-keymap-extension'
import { defineDocumentDropExtension } from '../document/document-drop-extension'
import { defineDocumentKeymapExtension } from '../document/document-keymap-extension'
import { renderKaTeXMathBlock, renderKaTeXMathInline } from '../sample/katex.ts'
import { uploadErrorAtom, uploadStatusAtom } from '../state/editor-atoms'
import { TagRuntime } from '../tag/tag-runtime'
import { defineCodeBlockView } from '../ui/code-block-view/index.ts'
import { defineImageView } from '../ui/image-view/index.ts'
import { defineTagView } from '../ui/tag-view/index.ts'
import { defineTaskListView } from '../ui/task-list-view/index.ts'
import { defineInlineMathInputRule } from './inline-math-input-rule'
import { defineMathKeymapExtension } from './math-keymap-extension'
import { defineTag } from './tag-extension'

function createUploader(adapters: EditorAdapters, store: EditorStore): Uploader<string> {
  return async ({ file, onProgress }) => {
    store.set(uploadErrorAtom, null)
    store.set(uploadStatusAtom, 'uploading')

    try {
      return await adapters.uploadImage({ file, onProgress })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      store.set(uploadErrorAtom, message)
      throw error
    }
    finally {
      store.set(uploadStatusAtom, 'idle')
    }
  }
}

function defineLoroTree(topic: EditorTopicRuntime) {
  const keymap = {
    'Mod-z': undo,
    'Mod-Z': redo,
    ...(!isApple ? { 'Mod-y': redo } : {}),
  }
  return withPriority(union(
    defineKeymap(keymap),
    defineCommands({ redo: () => redo, undo: () => undo }),
    definePlugin(LoroTreeEphemeralCursorPlugin(topic.presence)),
    definePlugin(LoroTreeUndoPlugin({ doc: topic.doc, manageSelection: false, undoManager: topic.undoManager })),
    definePlugin(LoroTreeSyncPlugin(topic)),
  ), Priority.high)
}

export function createEditorExtension(
  adapters: EditorAdapters,
  store: EditorStore,
  outlineRuntime: OutlineRuntime,
  onDocumentChange?: (document: NodeJSON) => void,
  topic?: EditorTopicRuntime,
  readOnly = false,
  cardReviewRuntime?: CardReviewRuntime,
) {
  const uploader = createUploader(adapters, store)
  const tagRuntime = new TagRuntime(adapters.tagStorage)

  const editorExtension = union(
    defineBasicExtension(),
    defineCardExtension(),
    ...(cardReviewRuntime ? [defineCardReviewExtension(cardReviewRuntime)] : []),
    withPriority(defineBlockIdExtension(), Priority.highest),
    defineTableKeymapExtension(),
    defineEditorKeymapExtension(),
    defineMathKeymapExtension(),
    defineDocumentDropExtension(outlineRuntime),
    defineDocumentKeymapExtension(outlineRuntime),
    defineOutlineKeymapExtension(outlineRuntime),
    defineOutlineViewExtension(outlineRuntime),
    defineDocChangeHandler((view) => {
      onDocumentChange?.(view.state.doc.toJSON())
    }),
    // Resolve the placeholder at render time from the current locale so it stays
    // in sync with the active language, reading through the shared global i18next
    // instance without needing to recreate the editor on language change.
    definePlaceholder({
      placeholder: () => i18next.t('ui.placeholder', { ns: 'editor' }),
    }),
    defineTag(tagRuntime),
    defineMath({
      renderMathBlock: renderKaTeXMathBlock,
      renderMathInline: renderKaTeXMathInline,
    }),
    defineInlineMathInputRule(),
    defineCodeBlockShiki(),
    defineHorizontalRule(),
    defineCodeBlockView(),
    defineImageView(),
    defineTagView(tagRuntime),
    defineTaskListView(),
    defineImageUploadHandler({
      uploader,
      onError: ({ error }) => {
        const message = error instanceof Error ? error.message : String(error)
        store.set(uploadErrorAtom, message)
      },
    }),
    ...(readOnly ? [defineReadonly()] : []),
  )

  return {
    extension: topic
      ? union(editorExtension, defineLoroTree(topic))
      : editorExtension,
    tagRuntime,
    uploader,
  }
}

export type EditorExtension = ReturnType<typeof createEditorExtension>['extension']
