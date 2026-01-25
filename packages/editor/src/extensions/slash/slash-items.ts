import type { Editor, Range } from '@tiptap/core'
import type { SlashCommand, SlashCommandGroupConfig } from './slash-types'
import { pipe } from 'effect'
import * as Arr from 'effect/Array'
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
  { id: 'Text', label: 'Text' },
  { id: 'List', label: 'List' },
  { id: 'Insert', label: 'Insert' },
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
  return [
    {
      id: 'paragraph',
      title: 'Paragraph',
      description: 'Start with plain text',
      group: 'Text',
      keywords: ['text', 'body'],
      icon: MdTextFields,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.setNode('paragraph'))
      },
    },
    {
      id: 'heading-1',
      title: 'Heading 1',
      description: 'Large section heading',
      group: 'Text',
      keywords: ['title', 'h1', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 1 }))
      },
    },
    {
      id: 'heading-2',
      title: 'Heading 2',
      description: 'Medium section heading',
      group: 'Text',
      keywords: ['h2', 'heading', 'subtitle'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 2 }))
      },
    },
    {
      id: 'heading-3',
      title: 'Heading 3',
      description: 'Small section heading',
      group: 'Text',
      keywords: ['h3', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 3 }))
      },
    },
    {
      id: 'heading-4',
      title: 'Heading 4',
      description: 'Small section heading',
      group: 'Text',
      keywords: ['h4', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 4 }))
      },
    },
    {
      id: 'heading-5',
      title: 'Heading 5',
      description: 'Small section heading',
      group: 'Text',
      keywords: ['h5', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 5 }))
      },
    },
    {
      id: 'heading-6',
      title: 'Heading 6',
      description: 'Small section heading',
      group: 'Text',
      keywords: ['h6', 'heading'],
      icon: MdTitle,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleHeading({ level: 6 }))
      },
    },
    {
      id: 'bullet-list',
      title: 'Bullet list',
      description: 'Create a bullet list',
      group: 'List',
      keywords: ['unordered', 'bullet'],
      icon: MdFormatListBulleted,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleList('bulletList', 'listItem'))
      },
    },
    {
      id: 'ordered-list',
      title: 'Ordered list',
      description: 'Create a numbered list',
      group: 'List',
      keywords: ['numbered', 'ordered', 'ol'],
      icon: MdFormatListNumbered,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleList('orderedList', 'orderedItem'))
      },
    },
    {
      id: 'task-list',
      title: 'Todo',
      description: 'Track tasks with checkboxes',
      group: 'List',
      keywords: ['todo', 'checkbox', 'task'],
      icon: MdCheckBox,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleTaskList())
      },
    },
    {
      id: 'blockquote',
      title: 'Blockquote',
      description: 'Capture a quote',
      group: 'Insert',
      keywords: ['quote', 'citation'],
      icon: MdFormatQuote,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleBlockquote())
      },
    },
    {
      id: 'code-block',
      title: 'Code block',
      description: 'Insert a code snippet',
      group: 'Insert',
      keywords: ['code', 'snippet', 'pre'],
      icon: MdCode,
      command: ({ editor, range }) => {
        runAfterDelete(editor, range, chain => chain.toggleCodeBlock())
      },
    },
    {
      id: 'table',
      title: 'Table',
      description: 'Insert a table',
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
