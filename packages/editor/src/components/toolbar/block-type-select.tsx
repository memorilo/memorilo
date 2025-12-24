import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@memorilo/components/ui/select'
import { Editor, Element as SlateElement, Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'

const BLOCK_TYPES = ['plain', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
type BlockType = typeof BLOCK_TYPES[number]

const BLOCK_TYPE_LABEL: Record<BlockType, string> = {
  plain: 'Plain',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
}

const BLOCK_TYLE_ICON: Record<BlockType, string> = {
  plain: '¶ ',
  h1: 'H1',
  h2: 'H2',
  h3: 'H3',
  h4: 'H4',
  h5: 'H5',
  h6: 'H6',
}

function isBlockType(type: unknown): type is BlockType {
  return typeof type === 'string' && (BLOCK_TYPES as readonly string[]).includes(type)
}

export function BlockTypeSelect() {
  const editor = useSlateStatic()

  const { blockTypeValue, canChangeBlockType } = useSlateSelector((editor) => {
    if (!editor.selection) {
      return { blockTypeValue: undefined, canChangeBlockType: false }
    }

    const at = Editor.unhangRange(editor, editor.selection)
    const foundTypes = new Set<BlockType>()

    for (const [node] of Editor.nodes(editor, {
      at,
      match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n) && isBlockType(n.type),
      mode: 'lowest',
    })) {
      foundTypes.add((node as any).type)
    }

    if (foundTypes.size === 0) {
      return { blockTypeValue: undefined, canChangeBlockType: false }
    }

    if (foundTypes.size === 1) {
      return { blockTypeValue: foundTypes.values().next().value as BlockType, canChangeBlockType: true }
    }

    return { blockTypeValue: undefined, canChangeBlockType: true }
  })

  return (
    <Select
      disabled={!canChangeBlockType}
      value={blockTypeValue}
      onValueChange={(value) => {
        if (!editor.selection || !isBlockType(value))
          return

        const at = Editor.unhangRange(editor, editor.selection)
        Editor.withoutNormalizing(editor, () => {
          const paths = Array.from(Editor.nodes(editor, {
            at,
            match: n => SlateElement.isElement(n) && isBlockType(n.type),
          }), ([, path]) => path)

          for (const path of paths) {
            Transforms.setNodes(editor, { type: value }, { at: path })
          }
        })
        ReactEditor.focus(editor)
      }}
    >
      <SelectTrigger size="sm" className="h-8 px-2 border-0 shadow-none">
        <SelectValue placeholder={canChangeBlockType ? 'Multiple' : 'Block'} />
      </SelectTrigger>
      <SelectContent>
        {BLOCK_TYPES.map(type => (
          <SelectItem key={type} value={type}>
            <span className="w-[2em] text-center font-bold">
              {BLOCK_TYLE_ICON[type]}
            </span>
            {BLOCK_TYPE_LABEL[type]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
