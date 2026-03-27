import type { EditorOptions } from '@tiptap/core'
import type { HTMLAttributes } from 'react'
import type { XmlElement, XmlFragment } from 'yjs'
import { cn } from '@memorilo/utils'
import Bold from '@tiptap/extension-bold'
import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration'
import HardBreak from '@tiptap/extension-hard-break'
import Highlight from '@tiptap/extension-highlight'
import Italic from '@tiptap/extension-italic'
import Strike from '@tiptap/extension-strike'
import Text from '@tiptap/extension-text'
import Underline from '@tiptap/extension-underline'
import UniqueID from '@tiptap/extension-unique-id'
import { Gapcursor } from '@tiptap/extensions'
import { EditorContent, useEditor } from '@tiptap/react'
import { useMemo } from 'react'
import Blockquote from './extensions/blockquote'
import { EditorBubbleMenu } from './extensions/bubble-menu'
import CodeBlock from './extensions/codeblock'
import { Emoji } from './extensions/emoji'
import Heading from './extensions/heading'
import Image from './extensions/image/index'
import InlineCode from './extensions/inline-code'
import Mathematics from './extensions/mathematics'
import Outline from './extensions/outline'
import { OutlineOrdItem } from './extensions/outline/outline-ord-item'
import { OutlineUordItem } from './extensions/outline/outline-uord-item'
import { Slash } from './extensions/slash'
import { Table } from './extensions/table'
import { TableDeleteAlertHost } from './extensions/table/table-delete-alert'
import { YjsDocumentContext } from './provider/yjs'

export interface MemoriloEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  fragment: YDocType
  onOutlineClick?: (uuid: string) => void
}

// eslint-disable-next-line react-refresh/only-export-components
export function createMemoriloEditorOptions(fragment: YDocType): Partial<EditorOptions> {
  const collaborationExtension = Collaboration.configure({ fragment })

  return {
    emitContentError: true,
    enableContentCheck: true,
    onContentError(err) {
      console.error('Content error:', err)
    },
    extensions: [
      Bold,
      Italic,
      Underline,
      Strike,
      Text,
      Outline,
      Emoji,
      Heading,
      Table,
      Mathematics,
      Image,
      Slash,
      Highlight.configure({
        multicolor: true,
      }),
      InlineCode,
      CodeBlock,
      Blockquote,
      HardBreak.extend({
        // Remove Mod-Enter shortcut for hard break to avoid conflict with cycle todo shortcut in outline task item
        addKeyboardShortcuts() {
          return {
            'Shift-Enter': () => this.editor.commands.setHardBreak(),
          }
        },
      }).configure({
        keepMarks: false,
      }),
      UniqueID.configure({
        attributeName: 'id',
        updateDocument: true,
        types: [OutlineOrdItem.type, OutlineUordItem.type],
        filterTransaction: (tr) => {
          // Adds support for collaborative editing
          // https://tiptap.dev/docs/editor/extensions/functionality/uniqueid#filtertransaction
          return !isChangeOrigin(tr)
        },
      }),
      collaborationExtension,
      Gapcursor,
    ],
    editorProps: {
      scrollMargin: { top: 24, bottom: 24, left: 0, right: 0 },
    },
  }
}

export function MemoriloEditor({
  className,
  fragment,
  onOutlineClick,
  ...props
}: MemoriloEditorProps) {
  const editorOptions = useMemo(() => createMemoriloEditorOptions(fragment), [fragment])

  const editor = useEditor(
    editorOptions,
    [editorOptions],
  )
  const yjsDocumentValue = useMemo(() => ({ fragment }), [fragment])

  return (
    <YjsDocumentContext value={yjsDocumentValue}>
      <div
        className={cn(
          'memorilo-editor px-8 py-4 [&_.ProseMirror]:outline-none',
          className,
        )}
        {...props}
      >
        <TableDeleteAlertHost editor={editor} />
        {editor ? <EditorBubbleMenu editor={editor} /> : null}
        <EditorContent editor={editor} />
      </div>
    </YjsDocumentContext>
  )
}

export type YDocType = XmlFragment | XmlElement
