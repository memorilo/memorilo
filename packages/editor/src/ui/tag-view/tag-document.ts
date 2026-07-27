import type { EditorView } from 'prosekit/pm/view'
import type { EditorTag } from '../../adapters/editor-adapters'

export function updateTagInDocument(view: EditorView, sourceId: string, tag: EditorTag) {
  let transaction = view.state.tr

  view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'tag' || node.attrs.id !== sourceId)
      return
    if (node.attrs.id === tag.id && node.attrs.label === tag.label)
      return

    transaction = transaction.setNodeMarkup(pos, undefined, tag)
  })

  if (transaction.docChanged)
    view.dispatch(transaction)
}
