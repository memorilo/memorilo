import type { HeadingOrPlainType } from '../element-type'
import type { SlashCommandContext, SlashCommandRegistry } from './types'
import { CalendarCheckIcon } from '@memorilo/components/ui/animiated-icons/calendar-check'
import { LinkIcon } from '@memorilo/components/ui/animiated-icons/link'
import { TerminalIcon } from '@memorilo/components/ui/animiated-icons/terminal'
import { Editor, Element as SlateElement } from 'slate'
import {
  canEditTable,
  insertDefaultTable,
  insertTableColumn,
  insertTableRow,
} from '../../components/elements/table/table-utils'
import { ensureTodoAtSelection, insertInlineMath, insertLink, setCurrentCodeblock, setCurrentMathBlock, setCurrentTextBlockType, toggleNearestTodoChecked } from './transforms'

const HEADING_ITEMS: Array<{ type: HeadingOrPlainType, title: string }> = [
  { type: 'plain', title: 'editor.slashCommands.block.plain' },
  { type: 'h1', title: 'editor.slashCommands.block.h1' },
  { type: 'h2', title: 'editor.slashCommands.block.h2' },
  { type: 'h3', title: 'editor.slashCommands.block.h3' },
  { type: 'h4', title: 'editor.slashCommands.block.h4' },
  { type: 'h5', title: 'editor.slashCommands.block.h5' },
  { type: 'h6', title: 'editor.slashCommands.block.h6' },
]

const TABLE_DISABLED_REASON = 'editor.slashCommands.table.disabledReason'

const isTableCommandDisabled = ({ editor }: SlashCommandContext) => !canEditTable(editor)

interface TableCommandConfig {
  id: string
  title: string
  description?: string
  requiresTable?: boolean
  run: (editor: SlashCommandContext['editor']) => void
}

function createTableCommand({ run, requiresTable = false, ...command }: TableCommandConfig) {
  return {
    ...command,
    group: 'insert',
    disabled: requiresTable ? isTableCommandDisabled : undefined,
    disabledReason: requiresTable ? () => TABLE_DISABLED_REASON : undefined,
    run: ({ editor }: SlashCommandContext) => run(editor),
  }
}

const TABLE_INSERT_COMMANDS: TableCommandConfig[] = [
  {
    id: 'insert:table-row-above',
    title: 'editor.slashCommands.insert.tableRowAbove.title',
    description: 'editor.slashCommands.insert.tableRowAbove.description',
    run: editor => insertTableRow(editor, 'before'),
  },
  {
    id: 'insert:table-row-below',
    title: 'editor.slashCommands.insert.tableRowBelow.title',
    description: 'editor.slashCommands.insert.tableRowBelow.description',
    run: editor => insertTableRow(editor, 'after'),
  },
  {
    id: 'insert:table-column-left',
    title: 'editor.slashCommands.insert.tableColumnLeft.title',
    description: 'editor.slashCommands.insert.tableColumnLeft.description',
    run: editor => insertTableColumn(editor, 'before'),
  },
  {
    id: 'insert:table-column-right',
    title: 'editor.slashCommands.insert.tableColumnRight.title',
    description: 'editor.slashCommands.insert.tableColumnRight.description',
    run: editor => insertTableColumn(editor, 'after'),
  },
]

const TABLE_COMMANDS = [
  createTableCommand({
    id: 'insert:table',
    title: 'editor.slashCommands.insert.table.title',
    description: 'editor.slashCommands.insert.table.description',
    run: insertDefaultTable,
  }),
  ...TABLE_INSERT_COMMANDS.map(command => createTableCommand({ ...command, requiresTable: true })),
]

export function createDefaultSlashCommandRegistry(): SlashCommandRegistry {
  return {
    groups: [
      { id: 'text', title: 'editor.slashCommands.group.text', order: 10 },
      { id: 'todo', title: 'editor.slashCommands.group.todo', order: 20 },
      { id: 'insert', title: 'editor.slashCommands.group.insert', order: 30 },
    ],
    commands: [
      ...HEADING_ITEMS.map(item => ({
        id: `block:${item.type}`,
        title: item.title,
        group: 'text',
        run: ({ editor }: SlashCommandContext) => setCurrentTextBlockType(editor, item.type === 'plain' ? 'plain' : item.type),
      })),
      {
        id: 'todo:set',
        title: 'editor.slashCommands.todo.set.title',
        description: 'editor.slashCommands.todo.set.description',
        group: 'todo',
        icon: <CalendarCheckIcon size={16} />,
        run: ({ editor }) => ensureTodoAtSelection(editor, false),
      },
      {
        id: 'todo:toggle-checked',
        title: 'editor.slashCommands.todo.toggleChecked.title',
        description: 'editor.slashCommands.todo.toggleChecked.description',
        group: 'todo',
        icon: <CalendarCheckIcon size={16} />,
        /**
         * This command is a true "toggle": it only makes sense when you're currently
         * in a todo item. We keep the "create todo" command separate.
         */
        disabled: ({ editor }) => Editor.above(editor, {
          at: editor.selection ?? undefined,
          match: n => SlateElement.isElement(n) && (n as any).type === 'todo',
        }) == null,
        disabledReason: () => 'editor.slashCommands.todo.toggleChecked.disabledReason',
        run: ({ editor }) => toggleNearestTodoChecked(editor),
      },
      {
        id: 'insert:codeblock',
        title: 'editor.slashCommands.insert.codeBlock.title',
        description: 'editor.slashCommands.insert.codeBlock.description',
        group: 'insert',
        icon: <TerminalIcon size={16} />,
        run: ({ editor }) => setCurrentCodeblock(editor),
      },
      {
        id: 'insert:math-inline',
        title: 'editor.slashCommands.insert.mathInline.title',
        description: 'editor.slashCommands.insert.mathInline.description',
        group: 'insert',
        icon: <span className="font-mono text-sm leading-none">∑</span>,
        run: ({ editor }) => insertInlineMath(editor),
      },
      {
        id: 'insert:math-block',
        title: 'editor.slashCommands.insert.mathBlock.title',
        description: 'editor.slashCommands.insert.mathBlock.description',
        group: 'insert',
        icon: <span className="font-mono text-sm leading-none">∑</span>,
        run: ({ editor }) => setCurrentMathBlock(editor),
      },
      {
        id: 'insert:link',
        title: 'editor.slashCommands.insert.link.title',
        description: 'editor.slashCommands.insert.link.description',
        group: 'insert',
        icon: <LinkIcon size={16} />,
        run: ({ editor }) => insertLink(editor, 'https://'),
      },
      ...TABLE_COMMANDS,
    ],
  }
}
