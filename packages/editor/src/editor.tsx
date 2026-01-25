import type { LoroDocType } from 'loro-prosemirror'
import type { HTMLAttributes } from 'react'
import { cn } from '@memorilo/utils'

import Bold from '@tiptap/extension-bold'
import HardBreak from '@tiptap/extension-hard-break'
import Highlight from '@tiptap/extension-highlight'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
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
import { createLoroSyncExtension } from './extensions/loro-sync'
import { Mathematics } from './extensions/mathematics'
import { Outline } from './extensions/outline'
import { SlashExtension } from './extensions/slash'
import { TableExtension } from './extensions/table'
import { LoroDocumentContext } from './provider/loro'

import './editor.css'

export interface MemoriloEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  doc: LoroDocType
  username?: string
}

export function MemoriloEditor({ className, doc, username, ...props }: MemoriloEditorProps) {
  const loroSyncExtension = useMemo(
    () => createLoroSyncExtension(doc, username),
    [doc, username],
  )

  const editor = useEditor(
    {
      extensions: [
        Bold,
        Italic,
        Underline,
        Strike,
        Paragraph,
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
        }),
        SlashExtension,
        TableExtension,
        EmojiExtension,
        Gapcursor,
        UniqueID.configure({
          attributeName: 'uuid',
          updateDocument: true,
          types: ['listItem', 'orderedItem', 'taskItem'],
        }),
        loroSyncExtension,
      ],
    },
    [doc, loroSyncExtension],
  )
  const loroDocumentValue = useMemo(() => ({ doc }), [doc])

  return (
    <LoroDocumentContext value={loroDocumentValue}>
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
    </LoroDocumentContext>
  )
}

export type { LoroDocType } from 'loro-prosemirror'
