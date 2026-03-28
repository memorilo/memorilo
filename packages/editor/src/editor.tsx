import type { EditorOptions } from '@tiptap/core'
import type { HTMLAttributes, ReactNode } from 'react'
import type { XmlFragment } from 'yjs'
import type { OutlineTopNode } from './extensions/outline'
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
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { useMemo, useRef } from 'react'
import { XmlElement } from 'yjs'
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
import {
  useOutlineRootConnectorTopStyle,
} from './extensions/outline/utils/use-outline-marker-center'
import { Slash } from './extensions/slash'
import { Table } from './extensions/table'
import { TableDeleteAlertHost } from './extensions/table/table-delete-alert'

export interface MemoriloEditorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  fragment: YDocType
  onOutlineClick?: (id: string) => void
  onContentError?: EditorOptions['onContentError']
}

interface DocumentRoot {
  kind: 'document'
  fragment: XmlFragment
  topNode: 'doc'
}

interface SubtreeRoot {
  kind: 'subtree'
  fragment: XmlElement
  topNode: Exclude<OutlineTopNode, 'doc'>
}

type ResolvedEditorRoot = DocumentRoot | SubtreeRoot

interface MemoriloEditorExtensionOptions {
  onOutlineClick?: (id: string) => void
  onContentError?: EditorOptions['onContentError']
}

const fragmentInstanceKeys = new WeakMap<YDocType, number>()
let nextFragmentInstanceKey = 0

function getFragmentInstanceKey(fragment: YDocType): number {
  const existingKey = fragmentInstanceKeys.get(fragment)
  if (existingKey !== undefined) {
    return existingKey
  }

  const nextKey = nextFragmentInstanceKey
  nextFragmentInstanceKey += 1
  fragmentInstanceKeys.set(fragment, nextKey)
  return nextKey
}

function resolveEditorRoot(fragment: YDocType): ResolvedEditorRoot {
  if (fragment instanceof XmlElement) {
    if (fragment.nodeName === 'outlineUList' || fragment.nodeName === 'outlineOrdList') {
      return {
        kind: 'subtree',
        fragment,
        topNode: fragment.nodeName,
      }
    }

    throw new Error(`Unsupported editor subtree root: ${fragment.nodeName}`)
  }

  return {
    kind: 'document',
    fragment,
    topNode: 'doc',
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export function createMemoriloEditorOptions(
  fragment: YDocType,
  extensionOptions: MemoriloEditorExtensionOptions = {},
): Partial<EditorOptions> {
  const resolvedRoot = resolveEditorRoot(fragment)
  const collaborationExtension = Collaboration.configure({ fragment: resolvedRoot.fragment })
  const enableContentCheck = resolvedRoot.topNode === 'doc'

  return {
    emitContentError: true,
    // `@tiptap/y-tiptap` always serializes Y fragments as `{ type: 'doc', ... }`
    // for collaboration content checks. That is correct for the document root,
    // but it is incompatible with subtree editors whose schema top node is
    // `outlineUList` or `outlineOrdList`.
    enableContentCheck,
    onContentError: (err) => {
      console.error('Content error:', err)
      extensionOptions.onContentError?.(err)
    },
    extensions: [
      Bold,
      Italic,
      Underline,
      Strike,
      Text,
      Outline.configure({
        topNode: resolvedRoot.topNode,
        onOutlineClick: extensionOptions.onOutlineClick,
      }),
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
        types: [OutlineOrdItem.name, OutlineUordItem.name],
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

function OutlineRootShell({
  children,
  editor,
}: {
  children: ReactNode
  editor: ReturnType<typeof useEditor>
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rootNode = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => currentEditor?.state.doc ?? null,
    equalityFn: Object.is,
  })

  useOutlineRootConnectorTopStyle(wrapperRef, rootNode)

  if (rootNode === null) {
    return children
  }

  return (
    <div ref={wrapperRef} className="relative outline-list-node-view">
      <span
        className="absolute border-l border-dashed border-gray-300 dark:border-gray-600 bottom-0 left-5"
        // The focused root shell measures the first marker button's bottom edge
        // directly, so this offset already matches the connector start position.
        style={{ top: 'var(--outline-connector-top)' }}
      />
      <div data-node-view-content="" data-node-view-content-react="" className="pl-10">
        {children}
      </div>
    </div>
  )
}

export function MemoriloEditorBody({
  editor,
  fragment,
}: {
  editor: ReturnType<typeof useEditor>
  fragment: YDocType
}) {
  const topNode = resolveEditorRoot(fragment).topNode
  const content = <EditorContent editor={editor} />

  return (
    <>
      <TableDeleteAlertHost editor={editor} />
      {editor ? <EditorBubbleMenu editor={editor} /> : null}
      {topNode === 'doc'
        ? content
        : <OutlineRootShell editor={editor}>{content}</OutlineRootShell>}
    </>
  )
}

export function MemoriloEditor({
  className,
  fragment,
  onOutlineClick,
  onContentError,
  ...props
}: MemoriloEditorProps) {
  return (
    <MemoriloEditorInstance
      key={getFragmentInstanceKey(fragment)}
      className={className}
      fragment={fragment}
      onOutlineClick={onOutlineClick}
      onContentError={onContentError}
      {...props}
    />
  )
}

function MemoriloEditorInstance({
  className,
  fragment,
  onOutlineClick,
  onContentError,
  ...props
}: MemoriloEditorProps) {
  const editorOptions = useMemo(
    () => createMemoriloEditorOptions(fragment, { onOutlineClick, onContentError }),
    [fragment, onContentError, onOutlineClick],
  )

  const editor = useEditor(
    editorOptions,
    [editorOptions],
  )

  return (
    <div
      className={cn(
        'memorilo-editor px-8 py-4 [&_.ProseMirror]:outline-none',
        className,
      )}
      {...props}
    >
      <MemoriloEditorBody editor={editor} fragment={fragment} />
    </div>
  )
}

export type YDocType = XmlFragment
