import { defineInputRule } from 'prosekit/extensions/input-rule'
import { InputRule } from 'prosekit/pm/inputrules'
import { TextSelection } from 'prosekit/pm/state'

const inlineMathShortcutRule = new InputRule(/\$\$ $/u, (state, _match, start, end) => {
  const mathInline = state.schema.nodes.mathInline
  if (!mathInline)
    throw new Error('Inline math shortcut requires the mathInline node')

  const transaction = state.tr.replaceWith(start, end, mathInline.create())
  transaction.setSelection(TextSelection.create(transaction.doc, start + 1))
  return transaction
})

export function defineInlineMathInputRule() {
  return defineInputRule(inlineMathShortcutRule)
}
