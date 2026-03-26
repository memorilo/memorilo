import type { Editor, Range } from '@tiptap/core'
import type { NodeType } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import type { SlashCommand, SlashCommandGroupConfig } from './slash-types'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
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

function setCurrentOutlineListType(
  tr: Transaction,
  listType: NodeType,
  itemType: NodeType,
) {
  const { $from } = tr.selection

  let outlineItemDepth: number | null = null
  let outlineListDepth: number | null = null
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (outlineItemDepth === null && node.type.isInGroup('outlineItem')) {
      outlineItemDepth = depth
    }
    if (outlineListDepth === null && node.type.isInGroup('outlineList')) {
      outlineListDepth = depth
    }
  }

  if (outlineItemDepth === null || outlineListDepth === null) {
    return false
  }

  const outlineItem = $from.node(outlineItemDepth)
  const outlineList = $from.node(outlineListDepth)

  const itemStart = $from.before(outlineItemDepth)
  const itemContentStart = itemStart + 1
  const anchorOffsetInItem = tr.selection.anchor - itemContentStart
  const headOffsetInItem = tr.selection.head - itemContentStart

  const nextChildren = [
    itemType.create(null, outlineItem.content, outlineItem.marks),
    ...Array.from({ length: Math.max(0, outlineList.childCount - 1) }, (_, index) => outlineList.child(index + 1)),
  ]
  const nextContent = Fragment.fromArray(nextChildren)
  if (!listType.validContent(nextContent)) {
    return false
  }

  const listStart = $from.before(outlineListDepth)
  const listEnd = $from.after(outlineListDepth)
  tr.replaceWith(
    listStart,
    listEnd,
    listType.create(outlineList.attrs, nextContent, outlineList.marks),
  )

  const mappedListStart = tr.mapping.map(listStart, -1)
  const mappedList = tr.doc.nodeAt(mappedListStart)
  const mappedItem = mappedList?.firstChild
  if (!mappedList || !mappedItem) {
    return false
  }

  const mappedItemStart = mappedListStart + 1
  const mappedContentStart = mappedItemStart + 1
  const mappedContentEnd = mappedItemStart + mappedItem.nodeSize - 1
  const remapOffset = (offsetInItem: number) => Math.min(
    Math.max(mappedContentStart + offsetInItem, mappedContentStart),
    mappedContentEnd,
  )

  tr.setSelection(
    TextSelection.create(
      tr.doc,
      remapOffset(anchorOffsetInItem),
      remapOffset(headOffsetInItem),
    ),
  )

  tr.scrollIntoView()
  return true
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
        const outlineUList = editor.state.schema.nodes.outlineUList
        const outlineUordItem = editor.state.schema.nodes.outlineUordItem
        if (!outlineUList || !outlineUordItem) {
          throw new Error('Required outline node types are not defined: outlineUList, outlineUordItem')
        }

        editor.chain().focus().deleteRange(range).command(({ tr }) => {
          return setCurrentOutlineListType(tr, outlineUList, outlineUordItem)
        }).run()
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
        const outlineOrdList = editor.state.schema.nodes.outlineOrdList
        const outlineOrdItem = editor.state.schema.nodes.outlineOrdItem
        if (!outlineOrdList || !outlineOrdItem) {
          throw new Error('Required outline node types are not defined: outlineOrdList, outlineOrdItem')
        }

        editor.chain().focus().deleteRange(range).command(({ tr }) => {
          return setCurrentOutlineListType(tr, outlineOrdList, outlineOrdItem)
        }).run()
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
        const outlineUList = editor.state.schema.nodes.outlineUList
        const outlineTaskItem = editor.state.schema.nodes.outlineTaskItem
        if (!outlineUList || !outlineTaskItem) {
          throw new Error('Required outline node types are not defined: outlineUList, outlineTaskItem')
        }

        editor.chain().focus().deleteRange(range).command(({ tr }) => {
          return setCurrentOutlineListType(tr, outlineUList, outlineTaskItem)
        }).run()
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
      keywords: ['grid', 'cells', 'table'],
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
) {
  const normalizedQuery = query.trim().toLowerCase()

  return pipe(
    commands,
    Arr.filter(command => (command.isEnabled ? command.isEnabled(editor) : true)),
    Arr.filter(command => matchesQuery(command, normalizedQuery)),
  )
}
