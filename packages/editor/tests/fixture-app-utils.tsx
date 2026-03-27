import type { EditorOptions } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import { EditorContent } from '@tiptap/react'
import { Doc } from 'yjs'
import { createMemoriloEditorOptions } from '../src/editor'
import { TableDeleteAlertHost } from '../src/extensions/table/table-delete-alert'
import { YjsDocumentContext } from '../src/provider/yjs'

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
  const editorProps = environment === 'full'
    ? {
        ...fullEnvironment.editorOptions.editorProps,
        attributes: {
          class: proseMirrorClass,
        },
      }
    : {
        ...minimalOptions.editorProps,
        attributes: {
          class: proseMirrorClass,
        },
      }

  return environment === 'full'
    ? {
        ...fullEnvironment.editorOptions,
        editorProps,
      }
    : {
        ...minimalOptions,
        editorProps,
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
    <YjsDocumentContext value={{ fragment: fullEnvironment.fragment }}>
      <div className="memorilo-editor px-8 py-4 [&_.ProseMirror]:outline-none">
        <TableDeleteAlertHost editor={editor} />
        <EditorContent editor={editor} />
      </div>
    </YjsDocumentContext>
  )
}
