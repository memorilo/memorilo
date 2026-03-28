import type { EditorOptions } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { EditorContent } from '@tiptap/react'
import { Doc } from 'yjs'
import { createMemoriloEditorOptions } from '../src/editor'
import { TableDeleteAlertHost } from '../src/extensions/table/table-delete-alert'

export type FixtureEnvironment = 'minimal' | 'full'

export interface FullFixtureEnvironment {
  fragment: ReturnType<Doc['getXmlFragment']>
  editorOptions: Partial<EditorOptions>
}

export function createFullFixtureEnvironment(): FullFixtureEnvironment {
  const doc = new Doc()
  const fragment = doc.getXmlFragment('doc')

  return {
    fragment,
    editorOptions: createMemoriloEditorOptions(fragment),
  }
}

export function getFixtureEditorOptions(
  environment: FixtureEnvironment,
  fullEnvironment: FullFixtureEnvironment,
  minimalOptions: Partial<EditorOptions>,
  proseMirrorClass: string,
): Partial<EditorOptions> {
  const options = environment === 'full' ? fullEnvironment.editorOptions : minimalOptions
  const attributes = options.editorProps?.attributes

  return {
    ...options,
    editorProps: {
      ...options.editorProps,
      attributes: {
        ...attributes,
        class: attributes?.class ? `${attributes.class} ${proseMirrorClass}` : proseMirrorClass,
      },
    },
  }
}

export function renderFixtureEditor(
  environment: FixtureEnvironment,
  fullEnvironment: FullFixtureEnvironment,
  editor: Editor | null,
) {
  if (environment !== 'full') {
    return (
      <>
        <TableDeleteAlertHost editor={editor} />
        <EditorContent editor={editor} />
      </>
    )
  }

  return (
    <div className="memorilo-editor px-8 py-4 [&_.ProseMirror]:outline-none">
      <TableDeleteAlertHost editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
