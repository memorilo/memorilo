import type { LoroDocType } from 'loro-prosemirror'
import type { HTMLAttributes } from 'react'
import { cn } from '@memorilo/utils'
import { Extension } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  CursorEphemeralStore,
  LoroEphemeralCursorPlugin,
  LoroSyncPlugin,
  LoroUndoPlugin,
} from 'loro-prosemirror'
import { useMemo } from 'react'

export interface MemoriloEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  doc: LoroDocType
  initialContent?: string
}

export function MemoriloEditor({ className, doc, initialContent, ...props }: MemoriloEditorProps) {
  const presence = useMemo(() => new CursorEphemeralStore(doc.peerIdStr), [doc])

  const loroExtension = useMemo(
    () =>
      Extension.create({
        name: 'loro-collab',
        addProseMirrorPlugins() {
          return [
            LoroSyncPlugin({ doc }),
            LoroUndoPlugin({ doc }),
            LoroEphemeralCursorPlugin(presence, {}),
          ]
        },
      }),
    [doc, presence],
  )

  const editor = useEditor(
    {
      extensions: [StarterKit.configure({ history: false }), loroExtension],
      content: initialContent ?? '<h2>hello,world</h2><p>tiptap + loro demo</p>',
    },
    [doc, initialContent, loroExtension],
  )

  return (
    <div className={cn('memorilo-editor', className)} {...props}>
      <EditorContent editor={editor} />
    </div>
  )
}

export type { LoroDocType } from 'loro-prosemirror'
