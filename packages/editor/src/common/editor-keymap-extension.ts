import type { Command } from 'prosekit/pm/state'
import { defineKeymap, Priority, withPriority } from 'prosekit/core'
import { newlineInCode } from 'prosekit/pm/commands'

const codeBlockEnter: Command = (state, dispatch, view) => {
  const { selection } = state
  if (!selection.empty)
    return false

  const { $head } = selection
  const parent = $head.parent
  const shouldExitCodeBlock = parent.type.spec.code
    && $head.parentOffset === parent.content.size
    && parent.textContent.endsWith('\n\n')
  if (shouldExitCodeBlock)
    return false

  return newlineInCode(state, dispatch, view)
}

export function defineEditorKeymapExtension() {
  return withPriority(defineKeymap({ Enter: codeBlockEnter }), Priority.high)
}
