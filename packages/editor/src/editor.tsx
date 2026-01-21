import type { LoroDocType } from 'loro-prosemirror'
import type { HTMLAttributes } from 'react'
import { cn } from '@memorilo/utils'

import Blockquote from '@tiptap/extension-blockquote'
import Bold from '@tiptap/extension-bold'
import Code from '@tiptap/extension-code'
import HardBreak from '@tiptap/extension-hard-break'
import Highlight from '@tiptap/extension-highlight'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
import Strike from '@tiptap/extension-strike'
import Text from '@tiptap/extension-text'
import Underline from '@tiptap/extension-underline'
import { Gapcursor } from '@tiptap/extensions'

import { EditorContent, useEditor } from '@tiptap/react'
import { useMemo } from 'react'
import { EditorBubbleMenu } from './extensions/bubble-menu'
import { CodeBlockPrism } from './extensions/codeblock'
import { OutlineImage } from './extensions/image'
import { createLoroSyncExtension } from './extensions/loro-sync'
import { Mathematics } from './extensions/mathematics'
import { Outline } from './extensions/outline'
import { TableExtension } from './extensions/table'
import { LoroDocumentContext } from './provider/loro'

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
        Blockquote.configure({
          HTMLAttributes: {
            class: 'border-l-[3px] border-gray-300 my-6 pl-4',
          },
        }),
        HardBreak.configure({
          keepMarks: false,
        }),
        Code.configure({
          HTMLAttributes: {
            class: 'font-mono text-red-500 text-sm py-1 px-1.5 mx-0.5 bg-gray-100 rounded',
          },
        }),
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
          bulletListHTMLAttributes: {
            class: 'list-none m-0 p-0 pl-0',
          },
          allowTable: true,
        }),
        TableExtension,
        Gapcursor,
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
          'memorilo-editor group/editor px-8 py-4',
          '[&_.ProseMirror]:outline-none',
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
