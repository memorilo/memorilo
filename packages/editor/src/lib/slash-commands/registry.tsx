import type { HeadingOrPlainType } from '../element-type'
import type { SlashCommandContext, SlashCommandRegistry } from './types'
import { CalendarCheckIcon } from '@memorilo/components/ui/animiated-icons/calendar-check'
import { LinkIcon } from '@memorilo/components/ui/animiated-icons/link'
import { TerminalIcon } from '@memorilo/components/ui/animiated-icons/terminal'
import { Editor, Element as SlateElement } from 'slate'
import { ensureTodoAtSelection, insertInlineMath, insertLink, setCurrentCodeblock, setCurrentMathBlock, setCurrentTextBlockType, toggleNearestTodoChecked } from './transforms'

const HEADING_ITEMS: Array<{ type: HeadingOrPlainType, title: string, titleEn: string, keywords: string[] }> = [
  { type: 'plain', title: '普通文本', titleEn: 'Plain', keywords: ['plain', 'paragraph', 'text', '普通', '文本'] },
  { type: 'h1', title: '标题 1', titleEn: 'Heading 1', keywords: ['h1', 'heading1', 'title', '标题1', '标题'] },
  { type: 'h2', title: '标题 2', titleEn: 'Heading 2', keywords: ['h2', 'heading2', '标题2', '标题'] },
  { type: 'h3', title: '标题 3', titleEn: 'Heading 3', keywords: ['h3', 'heading3', '标题3', '标题'] },
  { type: 'h4', title: '标题 4', titleEn: 'Heading 4', keywords: ['h4', 'heading4', '标题4', '标题'] },
  { type: 'h5', title: '标题 5', titleEn: 'Heading 5', keywords: ['h5', 'heading5', '标题5', '标题'] },
  { type: 'h6', title: '标题 6', titleEn: 'Heading 6', keywords: ['h6', 'heading6', '标题6', '标题'] },
]

export function createDefaultSlashCommandRegistry(): SlashCommandRegistry {
  return {
    groups: [
      { id: 'text', title: '文本', order: 10 },
      { id: 'todo', title: '待办', order: 20 },
      { id: 'insert', title: '插入', order: 30 },
    ],
    commands: [
      ...HEADING_ITEMS.map(item => ({
        id: `block:${item.type}`,
        title: item.title,
        titleEn: item.titleEn,
        group: 'text',
        keywords: item.keywords,
        run: ({ editor }: SlashCommandContext) => setCurrentTextBlockType(editor, item.type === 'plain' ? 'plain' : item.type),
      })),
      {
        id: 'todo:set',
        title: '待办',
        titleEn: 'Todo',
        description: '将当前块转换为待办',
        group: 'todo',
        keywords: ['todo', 'checkbox', 'check', '待办', '任务', '清单'],
        icon: <CalendarCheckIcon size={16} />,
        run: ({ editor }) => ensureTodoAtSelection(editor, false),
      },
      {
        id: 'todo:toggle-checked',
        title: '切换待办状态',
        titleEn: 'Toggle Todo',
        description: '切换勾选/未勾选',
        group: 'todo',
        keywords: ['todo', 'toggle', 'checked', 'unchecked', '切换', '状态', '勾选'],
        icon: <CalendarCheckIcon size={16} />,
        /**
         * This command is a true "toggle": it only makes sense when you're currently
         * in a todo item. We keep the "create todo" command separate.
         */
        disabled: ({ editor }) => Editor.above(editor, {
          at: editor.selection ?? undefined,
          match: n => SlateElement.isElement(n) && (n as any).type === 'todo',
        }) == null,
        disabledReason: () => '仅在待办块中可用',
        run: ({ editor }) => toggleNearestTodoChecked(editor),
      },
      {
        id: 'insert:codeblock',
        title: '代码块',
        titleEn: 'Code Block',
        description: '将当前块转换为代码块',
        group: 'insert',
        keywords: ['code', 'codeblock', 'snippet', '```', '代码', '代码块'],
        icon: <TerminalIcon size={16} />,
        run: ({ editor }) => setCurrentCodeblock(editor),
      },
      {
        id: 'insert:math-inline',
        title: '行内公式',
        titleEn: 'Inline Equation',
        description: '插入行内公式（$...$）',
        group: 'insert',
        keywords: ['math', 'equation', 'katex', 'latex', '$', '公式', '行内'],
        icon: <span className="font-mono text-sm leading-none">∑</span>,
        run: ({ editor }) => insertInlineMath(editor),
      },
      {
        id: 'insert:math-block',
        title: '公式块',
        titleEn: 'Equation Block',
        description: '将当前块转换为公式块（$$...$$）',
        group: 'insert',
        keywords: ['math', 'equation', 'katex', 'latex', '$$', '公式', '块级'],
        icon: <span className="font-mono text-sm leading-none">∑</span>,
        run: ({ editor }) => setCurrentMathBlock(editor),
      },
      {
        id: 'insert:link',
        title: '链接',
        titleEn: 'Link',
        description: '插入链接',
        group: 'insert',
        keywords: ['link', 'url', 'hyperlink', 'https', '链接', '网址'],
        icon: <LinkIcon size={16} />,
        run: ({ editor }) => insertLink(editor, 'https://'),
      },
    ],
  }
}
