import type { LoroDocType } from 'loro-prosemirror'
import type { HTMLAttributes } from 'react'
import { cn } from '@memorilo/utils'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'

import Text from '@tiptap/extension-text'
import { EditorContent, useEditor } from '@tiptap/react'

import { useMemo } from 'react'
import { createLoroSyncExtension } from './extensions/loro-sync'
import { Outline } from './extensions/outline'
import { LoroDocumentContext } from './provider/loro'

const BulletDocument = Document.extend({
  content: 'bulletList',
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
        Paragraph,
        Text,
        Outline.configure({
          bulletListHTMLAttributes: {
            class: 'list-none m-0 p-0 pl-0',
          },
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
          'memorilo-editor group/editor px-8 py-4',
          '[&_.ProseMirror]:outline-none',
          className,
        )}
        {...props}
      >
        <EditorContent editor={editor} />
      </div>
    </LoroDocumentContext>
  )
}

export type { LoroDocType } from 'loro-prosemirror'
