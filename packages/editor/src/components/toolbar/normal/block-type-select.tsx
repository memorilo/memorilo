import type { HeadingOrPlainType as BlockType } from '../../../lib/element-type'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@memorilo/components/ui/select'
import { Array, pipe } from 'effect'
import { Editor, Element as SlateElement, Transforms } from 'slate'
import { ReactEditor, useSlateSelector, useSlateStatic } from 'slate-react'
import { HEADING_AND_PLAIN_TYPES as BLOCK_TYPES, isHeadingOrPlainType as isBlockType } from '../../../lib/element-type'
import { getLowestIndentEntriesInRange, wrapIndentHeaderInBlock } from '../../../lib/transforms/indent'

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

/**
 * Toolbar control for converting the current selection into a different block type.
 *
 * Primary behavior: changes the `type` of selected heading/plain blocks.
 *
 * Fallback behavior: if the selection intersects `indent` containers but does not include any
 * heading/plain blocks directly, wraps the indent header portion into the chosen block type.
 */
export function BlockTypeSelect() {
  const editor = useSlateStatic()

  const { blockTypeValue, canChangeBlockType } = useSlateSelector((editor) => {
    if (!editor.selection) {
      return { blockTypeValue: undefined, canChangeBlockType: false }
    }

    const at = Editor.unhangRange(editor, editor.selection)
    const foundTypes = new Set<BlockType>()

    // Primary path: selection directly hits heading/plain blocks.
    for (const [node] of Editor.nodes(editor, {
      at,
      match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n) && isBlockType(n.type),
      mode: 'lowest',
    })) {
      foundTypes.add((node as SlateElement).type as BlockType)
    }

    if (foundTypes.size === 0) {
      // Fallback: selection only hits outline `indent` containers.
      const indentEntries = getLowestIndentEntriesInRange(editor, at)
      if (indentEntries.length === 0)
        return { blockTypeValue: undefined, canChangeBlockType: false }

      /**
       * When selection hits `indent` containers without explicit heading/plain blocks,
       * show `plain` as the default value so the control stays usable.
       */
      return { blockTypeValue: 'plain', canChangeBlockType: true }
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
          const blockPaths = pipe(
            Array.fromIterable(Editor.nodes(editor, {
              at,
              match: n => SlateElement.isElement(n) && isBlockType(n.type),
            })),
            Array.map(([, path]) => path),
          )

          // Primary path: mutate existing heading/plain blocks in-place.
          if (blockPaths.length > 0) {
            for (const path of blockPaths) {
              Transforms.setNodes(editor, { type: value }, { at: path })
            }
            return
          }

          // Fallback: selection only hits `indent` containers => wrap indent header directly.
          const indentEntries = getLowestIndentEntriesInRange(editor, at)
          for (const [, indentPath] of indentEntries) {
            wrapIndentHeaderInBlock(editor, indentPath, value)
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
