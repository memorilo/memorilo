import type { Editor } from 'slate'
import { Path, Transforms } from 'slate'
import { isIndent, isText } from './element-type'

export function withIndent(editor: Editor) {
  const { normalizeNode } = editor

  editor.normalizeNode = ([node, path]) => {
    // If root level and not indent, wrap in indent
    if (path.length === 1 && !isIndent(node)) {
      Transforms.wrapNodes(
        editor,
        { type: 'indent', children: [node] as any },
        {
          at: path,
        },
      )
      return
    }
    if (isIndent(node)) {
      // If indent, ensure all children are block elements
      const firstInlineIndex = node.children.findIndex(child => isText(child) || editor.isInline(child))
      if (firstInlineIndex !== -1) {
        // There is at least one inline child, wrap all inline children in a plain block
        // Find last inline child, if one element is inline, all following siblings are also inline
        const lastInlineIndex = node.children.length - 1

        Transforms.wrapNodes(
          editor,
          { type: 'plain', children: [] },
          {
            at: path,
            match: (_n, p) => Path.isChild(p, path) && p[p.length - 1] >= firstInlineIndex && p[p.length - 1] <= lastInlineIndex,
            mode: 'highest',
          },
        )
        return
      }

      // If there is other indent inside, convert other children to indent except first child(which is the header of the outline)
      if (node.children.length > 1) {
        const children = node.children
        const restChildren = children.slice(1)
        const hasIndentSibling = restChildren.some(child => isIndent(child))

        if (hasIndentSibling) {
          // Case 1: Mixed indent and non-indent siblings
          // If there are indent siblings, all other siblings should also be wrapped in indent
          // This ensures that the structure becomes:
          // Indent
          //   - Header (First Child)
          //   - Indent (Child 2)
          //   - Indent (Child 3)
          const index = children.findIndex((child, i) => i > 0 && !isIndent(child))
          if (index !== -1) {
            Transforms.wrapNodes(
              editor,
              { type: 'indent', children: [] },
              {
                at: path.concat(index),
              },
            )
            return
          }
        }
        else {
          // Case 2: No indent siblings
          // If there are no indent siblings, it means these are just multiple blocks that should be siblings of the current indent
          // We lift them out to be siblings of the current indent block
          Transforms.liftNodes(editor, { at: path.concat(1) })
          return
        }
      } // End if node.children.length > 1

      if (isIndent(node.children[0])) {
        // If first child is also indent, unwrap it
        Transforms.unwrapNodes(editor, { at: path.concat(0) })
        return
      }
    }
    return normalizeNode([node, path])
  }

  return editor
}
