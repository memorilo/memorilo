import type { HTMLAttributes } from 'react'
import type { XmlElement, XmlFragment } from 'yjs'
import { cn } from '@memorilo/utils'

import Bold from '@tiptap/extension-bold'
import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration'
import HardBreak from '@tiptap/extension-hard-break'
import Highlight from '@tiptap/extension-highlight'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
import Strike from '@tiptap/extension-strike'
import Text from '@tiptap/extension-text'
import Underline from '@tiptap/extension-underline'

import UniqueID from '@tiptap/extension-unique-id'
import { EditorContent, useEditor } from '@tiptap/react'
import { useMemo } from 'react'
import { EditorBubbleMenu } from './extensions/bubble-menu'
import { Outline } from './extensions/outline'

import { YjsDocumentContext } from './provider/yjs'
import './editor.css'

export interface MemoriloEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  fragment: XmlFragment | XmlElement
  onOutlineClick?: (uuid: string) => void
}

export function MemoriloEditor({
  className,
  fragment,
  onOutlineClick,
  ...props
}: MemoriloEditorProps) {
  const collaborationExtension = useMemo(
    () => Collaboration.configure({ fragment }),
    [fragment],
  )

  const editor = useEditor(
    {
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
        Paragraph,
        Outline,
        HardBreak.configure({
          keepMarks: false,
        }),
        Highlight.configure({
          multicolor: true,
        }),
        UniqueID.configure({
          attributeName: 'uuid',
          updateDocument: true,
          types: [],
          filterTransaction: (tr) => {
            // Adds support for collaborative editing
            // https://tiptap.dev/docs/editor/extensions/functionality/uniqueid#filtertransaction
            return !isChangeOrigin(tr)
          },
        }),
        collaborationExtension,
      ],
      editorProps: {
        scrollMargin: { top: 24, bottom: 24, left: 0, right: 0 },
      },
    },
    [collaborationExtension, onOutlineClick],
  )
  const yjsDocumentValue = useMemo(() => ({ fragment }), [fragment])

  return (
    <YjsDocumentContext value={yjsDocumentValue}>
      <div
        className={cn(
          'memorilo-editor',
          className,
        )}
        {...props}
      >
        {/* {editor ? <EditorBubbleMenu editor={editor} /> : null} */}
        <EditorContent editor={editor} />
      </div>
    </YjsDocumentContext>
  )
}

export type YDocType = XmlFragment | XmlElement
