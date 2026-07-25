import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'

export interface EditorAction {
  active: boolean
  canExec: boolean
  run: () => void
}

function action(active: boolean, canExec: boolean, run: () => void): EditorAction {
  return { active, canExec, run }
}

export function getEditorActions(editor: Editor<BasicExtension>) {
  return {
    block: {
      blockquote: action(
        editor.nodes.blockquote.isActive(),
        editor.commands.toggleBlockquote.canExec(),
        () => editor.commands.toggleBlockquote(),
      ),
      bulletList: action(
        editor.nodes.list.isActive({ kind: 'bullet' }),
        editor.commands.toggleList.canExec({ kind: 'bullet' }),
        () => editor.commands.toggleList({ kind: 'bullet' }),
      ),
      codeBlock: action(
        editor.nodes.codeBlock.isActive(),
        editor.commands.setCodeBlock.canExec(),
        () => editor.commands.setCodeBlock(),
      ),
      orderedList: action(
        editor.nodes.list.isActive({ kind: 'ordered' }),
        editor.commands.toggleList.canExec({ kind: 'ordered' }),
        () => editor.commands.toggleList({ kind: 'ordered' }),
      ),
      taskList: action(
        editor.nodes.list.isActive({ kind: 'task' }),
        editor.commands.toggleList.canExec({ kind: 'task' }),
        () => editor.commands.toggleList({ kind: 'task' }),
      ),
      toggleList: action(
        editor.nodes.list.isActive({ kind: 'toggle' }),
        editor.commands.toggleList.canExec({ kind: 'toggle' }),
        () => editor.commands.toggleList({ kind: 'toggle' }),
      ),
    },
    heading: {
      paragraph: action(
        editor.nodes.paragraph.isActive(),
        editor.commands.setParagraph.canExec(),
        () => editor.commands.setParagraph(),
      ),
      heading1: action(
        editor.nodes.heading.isActive({ level: 1 }),
        editor.commands.setHeading.canExec({ level: 1 }),
        () => editor.commands.setHeading({ level: 1 }),
      ),
      heading2: action(
        editor.nodes.heading.isActive({ level: 2 }),
        editor.commands.setHeading.canExec({ level: 2 }),
        () => editor.commands.setHeading({ level: 2 }),
      ),
      heading3: action(
        editor.nodes.heading.isActive({ level: 3 }),
        editor.commands.setHeading.canExec({ level: 3 }),
        () => editor.commands.setHeading({ level: 3 }),
      ),
      heading4: action(
        editor.nodes.heading.isActive({ level: 4 }),
        editor.commands.setHeading.canExec({ level: 4 }),
        () => editor.commands.setHeading({ level: 4 }),
      ),
      heading5: action(
        editor.nodes.heading.isActive({ level: 5 }),
        editor.commands.setHeading.canExec({ level: 5 }),
        () => editor.commands.setHeading({ level: 5 }),
      ),
      heading6: action(
        editor.nodes.heading.isActive({ level: 6 }),
        editor.commands.setHeading.canExec({ level: 6 }),
        () => editor.commands.setHeading({ level: 6 }),
      ),
    },
    insert: {
      divider: action(
        false,
        editor.commands.insertHorizontalRule.canExec(),
        () => editor.commands.insertHorizontalRule(),
      ),
      image: {
        canExec: editor.commands.insertImage.canExec(),
      },
      table: action(
        false,
        editor.commands.insertTable.canExec({ row: 3, col: 3 }),
        () => editor.commands.insertTable({ row: 3, col: 3 }),
      ),
    },
    mark: {
      bold: action(
        editor.marks.bold.isActive(),
        editor.commands.toggleBold.canExec(),
        () => editor.commands.toggleBold(),
      ),
      code: action(
        editor.marks.code.isActive(),
        editor.commands.toggleCode.canExec(),
        () => editor.commands.toggleCode(),
      ),
      italic: action(
        editor.marks.italic.isActive(),
        editor.commands.toggleItalic.canExec(),
        () => editor.commands.toggleItalic(),
      ),
      strike: action(
        editor.marks.strike.isActive(),
        editor.commands.toggleStrike.canExec(),
        () => editor.commands.toggleStrike(),
      ),
      underline: action(
        editor.marks.underline.isActive(),
        editor.commands.toggleUnderline.canExec(),
        () => editor.commands.toggleUnderline(),
      ),
    },
  }
}
