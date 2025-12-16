import type { NodeEntry } from 'slate'
import { useCallback, useState } from 'react'
import { Editor, Element, Range } from 'slate'
import { useSlateStatic } from 'slate-react'
import { decorateCodeBlock } from '../lib/decorate'

export function useDecorate() {
  const editor = useSlateStatic()
  const [forceUpdate, setForceUpdate] = useState(0)

  return useCallback(([node, path]: NodeEntry) => {
    if (editor.selection != null) {
      if (
        !Editor.isEditor(node)
        && Editor.string(editor, [path[0]]) === ''
        && Range.includes(editor.selection, path)
        && Range.isCollapsed(editor.selection)
      ) {
        return [
          {
            ...editor.selection,
            placeholder: true,
          },
        ]
      }
    }
    if (Element.isElement(node) && node.type === 'codeblock') {
      return decorateCodeBlock([node, path], () => setForceUpdate(forceUpdate + 1))
    }
    return []
  }, [editor, forceUpdate, setForceUpdate])
}
