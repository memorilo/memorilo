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
import { BlockquoteExtension } from './extensions/blockquote'
import { EditorBubbleMenu } from './extensions/bubble-menu'
import { CodeBlockPrism } from './extensions/codeblock'
import { EmojiExtension } from './extensions/emoji'
import { OutlineImage } from './extensions/image'
import { InlineCodeExtension } from './extensions/inline-code'
import { Mathematics } from './extensions/mathematics'
import { Outline } from './extensions/outline'
import { TitleParagraph } from './extensions/paragraph'
import { SlashExtension } from './extensions/slash'
import { TableExtension } from './extensions/table'
import { YjsDocumentContext } from './provider/yjs'

import './editor.css'

export interface MemoriloEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  fragment: XmlFragment | XmlElement
  rootNode?: 'doc' | 'listItem' | 'orderedItem' | 'taskItem'
  hideTitle?: boolean
  downloadImage?: boolean
  onOutlineClick?: (uuid: string) => void
}

export function MemoriloEditor({
  className,
  fragment,
  rootNode = 'doc',
  hideTitle = false,
  downloadImage = false,
  onOutlineClick,
  ...props
}: MemoriloEditorProps) {
  const collaborationExtension = useMemo(
    () => Collaboration.configure({ fragment }),
    [fragment],
  )

  const editor = useEditor(
    {
      extensions: [
        Bold,
        Italic,
        Underline,
        Strike,
        TitleParagraph.configure({
          hideTitle,
        }),
        Text,
        BlockquoteExtension,
        HardBreak.configure({
          keepMarks: false,
        }),
        InlineCodeExtension,
        Highlight.configure({
          multicolor: true,
        }),
        OutlineImage.configure({
          downloadImage,
          resize: {
            enabled: true,
            directions: [
              'top',
              'bottom',
              'left',
              'right',
              'top-left',
              'top-right',
              'bottom-left',
              'bottom-right',
            ],
            minHeight: 50,
            minWidth: 50,
          },
        }),
        Mathematics.configure({
          katexOptions: {
            throwOnError: false,
          },
        }),
        CodeBlockPrism.configure({
          languageClassPrefix: 'language-',
          defaultLanguage: null,
          enableTabIndentation: true,
          exitOnTripleEnter: true,
          exitOnArrowDown: true,
        }),
        Outline.configure({
          allowTable: true,
          rootNode,
          onOutlineClick,
        }),
        SlashExtension,
        TableExtension,
        EmojiExtension,
        Gapcursor,
        UniqueID.configure({
          attributeName: 'uuid',
          updateDocument: true,
          types: ['listItem', 'orderedItem', 'taskItem', 'bulletList'],
          filterTransaction: (tr) => {
            // Adds support for collaborative editing
            // https://tiptap.dev/docs/editor/extensions/functionality/uniqueid#filtertransaction
            return !isChangeOrigin(tr)
          },
        }),
        collaborationExtension,
      ],
      editorProps: {
        attributes: {
          'data-outline-root': rootNode,
          'data-outline-hide-title': hideTitle ? 'true' : 'false',
        },
      },
    },
    [fragment, collaborationExtension, rootNode, onOutlineClick, hideTitle],
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
        {editor ? <EditorBubbleMenu editor={editor} /> : null}
        <EditorContent editor={editor} />
      </div>
    </YjsDocumentContext>
  )
}

export type YDocType = XmlFragment | XmlElement
