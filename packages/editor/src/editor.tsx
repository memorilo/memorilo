import type { LoroDocType } from 'loro-prosemirror'
import type { HTMLAttributes } from 'react'
import { mergeAttributes } from '@tiptap/core'
import { cn } from '@memorilo/utils'
import Bold from '@tiptap/extension-bold'
import Code from '@tiptap/extension-code'
import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Italic from '@tiptap/extension-italic'
import Paragraph from '@tiptap/extension-paragraph'
import Strike from '@tiptap/extension-strike'
import Text from '@tiptap/extension-text'
import Underline from '@tiptap/extension-underline'
import { Gapcursor } from '@tiptap/extensions'

import { EditorContent, useEditor } from '@tiptap/react'
import { useMemo } from 'react'
import { EditorBubbleMenu } from './extensions/bubble-menu'
import { createLoroSyncExtension } from './extensions/loro-sync'
import { Outline } from './extensions/outline'
import { headingClassByLevel } from './heading'
import { LoroDocumentContext } from './provider/loro'

const BulletDocument = Document.extend({
  content: 'bulletList',
})

const StyledHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const level = node.attrs.level
    return [
      `h${level}`,
      mergeAttributes(HTMLAttributes, { class: headingClassByLevel[level] }),
      0,
    ]
  },
})

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
        BulletDocument,
        Bold,
        StyledHeading.configure({
          levels: [1, 2, 3, 4, 5, 6],
        }),
        Italic,
        Underline,
        Strike,
        Paragraph,
        Text,
        Code.configure({
          HTMLAttributes: {
            class: 'font-mono text-red-500 text-sm py-1 px-1.5 mx-0.5 bg-gray-100 rounded',
          },
        }),
        Outline.configure({
          bulletListHTMLAttributes: {
            class: 'list-none m-0 p-0 pl-0',
          },
        }),
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
