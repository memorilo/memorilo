import type { Editor, Range } from '@tiptap/core'
import type { SlashCommand, SlashCommandGroupConfig } from './slash-types'
import { pipe } from 'effect'
import * as Arr from 'effect/Array'
import i18next from 'i18next'
import {
  MdCheckBox,
  MdCode,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatQuote,
  MdTableRows,
  MdTextFields,
  MdTitle,
} from 'react-icons/md'

const defaultTableOptions = {
  rows: 3,
  cols: 3,
  withHeaderRow: true,
} as const

export const slashCommandGroups: SlashCommandGroupConfig[] = [
  { id: 'Text', labelKey: 'editor.slash.group.text' },
  { id: 'List', labelKey: 'editor.slash.group.list' },
  { id: 'Insert', labelKey: 'editor.slash.group.insert' },
]

type CommandChain = ReturnType<Editor['chain']>

function runAfterDelete(
  editor: Editor,
  range: Range,
  apply: (chain: CommandChain) => CommandChain,
) {
  apply(editor.chain().focus().deleteRange(range)).run()
}

function matchesQuery(command: SlashCommand, query: string) {
  if (!query) {
    return true
  }

  const keywords = command.keywords ?? []
  const searchText = [command.title, command.description, ...keywords]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return searchText.includes(query)
}

export function getDefaultSlashCommands(): SlashCommand[] {
  const t = (key: string) => i18next.t(key as never, { ns: 'app' }) as string
  return [
    {
      id: 'paragraph',
      title: t('editor.slash.item.paragraph.title'),
      description: t('editor.slash.item.paragraph.description'),
      group: 'Text',
      keywords: ['text', 'body'],
      icon: MdTextFields,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.setNode('paragraph'))
      },
    },
    {
      id: 'heading-1',
      title: t('editor.heading.level_1'),
      description: t('editor.slash.item.heading_1.description'),
      group: 'Text',
      keywords: ['title', 'h1', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 1 }))
      },
    },
    {
      id: 'heading-2',
      title: t('editor.heading.level_2'),
      description: t('editor.slash.item.heading_2.description'),
      group: 'Text',
      keywords: ['h2', 'heading', 'subtitle'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 2 }))
      },
    },
    {
      id: 'heading-3',
      title: t('editor.heading.level_3'),
      description: t('editor.slash.item.heading_3.description'),
      group: 'Text',
      keywords: ['h3', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 3 }))
      },
    },
    {
      id: 'heading-4',
      title: t('editor.heading.level_4'),
      description: t('editor.slash.item.heading_4.description'),
      group: 'Text',
      keywords: ['h4', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 4 }))
      },
    },
    {
      id: 'heading-5',
      title: t('editor.heading.level_5'),
      description: t('editor.slash.item.heading_5.description'),
      group: 'Text',
      keywords: ['h5', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 5 }))
      },
    },
    {
      id: 'heading-6',
      title: t('editor.heading.level_6'),
      description: t('editor.slash.item.heading_6.description'),
      group: 'Text',
      keywords: ['h6', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 6 }))
      },
    },
    {
      id: 'bullet-list',
      title: t('editor.slash.item.bullet_list.title'),
      description: t('editor.slash.item.bullet_list.description'),
      group: 'List',
      keywords: ['unordered', 'bullet'],
      icon: MdFormatListBulleted,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleList('bulletList', 'listItem'))
      },
    },
    {
      id: 'ordered-list',
      title: t('editor.slash.item.ordered_list.title'),
      description: t('editor.slash.item.ordered_list.description'),
      group: 'List',
      keywords: ['numbered', 'ordered', 'ol'],
      icon: MdFormatListNumbered,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleList('orderedList', 'orderedItem'))
      },
    },
    {
      id: 'task-list',
      title: t('editor.slash.item.todo.title'),
      description: t('editor.slash.item.todo.description'),
      group: 'List',
      keywords: ['todo', 'checkbox', 'task'],
      icon: MdCheckBox,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleTaskList())
      },
    },
    {
      id: 'blockquote',
      title: t('editor.slash.item.blockquote.title'),
      description: t('editor.slash.item.blockquote.description'),
      group: 'Insert',
      keywords: ['quote', 'citation'],
      icon: MdFormatQuote,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleBlockquote())
      },
    },
    {
      id: 'code-block',
      title: t('editor.slash.item.code_block.title'),
      description: t('editor.slash.item.code_block.description'),
      group: 'Insert',
      keywords: ['code', 'snippet', 'pre'],
      icon: MdCode,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleCodeBlock())
      },
    },
    {
      id: 'table',
      title: t('editor.slash.item.table.title'),
      description: t('editor.slash.item.table.description'),
      group: 'Insert',
      keywords: ['grid', 'cells'],
      icon: MdTableRows,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.insertTable(defaultTableOptions))
      },
    },
  ]
}

export function filterSlashCommands(
  commands: SlashCommand[],
  query: string,
  editor: Editor,
  maxItems: number,
) {
  const normalizedQuery = query.trim().toLowerCase()

  return pipe(
    commands,
    Arr.filter(command => (command.isEnabled ? command.isEnabled(editor) : true)),
    Arr.filter(command => matchesQuery(command, normalizedQuery)),
    Arr.take(maxItems),
  )
}
