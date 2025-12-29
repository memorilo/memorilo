import type { RefAttributes, TextareaHTMLAttributes } from 'react'
import type { Descendant } from 'slate'
import type { SlashCommandRegistry } from './lib/slash-commands/types'
import { cn } from '@memorilo/utils'
import { useMemo, useState } from 'react'
import { createEditor } from 'slate'
import { withHistory } from 'slate-history'
import { Editable, Slate, useSlateStatic, withReact } from 'slate-react'
import { TableCursor, TableEditor } from 'slate-table'
import { IndentDragProvider, RootIndentEnableContext } from './components/elements/indent'
import { TableProvider } from './components/elements/table/table-provider'
import { useSlashCommands } from './components/slash-commands/use-slash-commands'
import { FormatToolbar } from './components/toolbar'
import { ToolbarProvider } from './components/toolbar/toolbar'
import { useDecorate } from './hooks/use-decorate'
import { useKeyDownHandler } from './hooks/use-key-down-handler'
import { useRenderElement } from './hooks/use-render-element'
import { useRenderLeaf } from './hooks/use-render-leaf'
import { toCodeLines } from './lib/code'
import { createDefaultSlashCommandRegistry } from './lib/slash-commands/registry'
import { withCodeblock } from './lib/with-codeblock'
import { withImages } from './lib/with-image'
import { withIndent } from './lib/with-indent'
import { withLink } from './lib/with-link'
import { withMath } from './lib/with-math'
import { withTable } from './lib/with-table'
import { withTodo } from './lib/with-todo'
import './globals.css'

const initialValue: Descendant[] = [
  {
    type: 'indent',
    children: [
      { type: 'h1', children: [{ text: 'Memorilo Editor Demo' }] },
      { type: 'indent', children: [{ type: 'plain', children: [{ text: '君不见，' }, { text: '左纳言，右纳史', italic: true }, { text: '，' }, { text: '朝承恩，暮赐死', strikethrough: true }, { text: '。' }, { text: '行路难', italic: true }, { text: '，不在水，不在山，' }, { text: '只在人情反覆间', strikethrough: true }, { text: '！' }] }] },
      { type: 'indent', children: [{ type: 'plain', children: [{ text: '君', bold: true }, { text: 'のような' }, { text: 'ひと', bold: true }, { text: 'になりたいな，「' }, { text: '僕らしいひと', bold: true }, { text: '」になりたいな' }] }, { type: 'indent', children: [{ type: 'plain', children: [{ text: 'CJK 字形: 门上插刀 直字拐弯 天上平板 船顶漏雨' }] }] }] },
      { type: 'indent', children: [{ type: 'plain', children: [{ text: 'Benu min per ' }, { underline: true, text: 'koro milda' }, { text: ',  ' }, { underline: true, text: 'animo libera' }, { text: ' kaj ' }, { underline: true, text: 'vivo feliĉa' }, { text: '; regu surtere amo kaj paco' }] }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'image', url: 'https://github.com/mslxl/wallpapers/blob/main/twitter-1774762746007204094.jpg?raw=true', children: [{ text: '' }], width: 430, height: 242 },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'plain', children: [{ text: 'Welcome to the Memorilo Editor demo! Visit ' }, { type: 'link', children: [{ text: 'memorilo/memorilo' }], url: 'https://github.com/memorilo/memorilo' }, { text: ' on GitHub for more information.' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      {
        type: 'todo',
        checked: true,
        children: [
          { type: 'quote', children: [{ text: 'A Notion-style rich text editor, still under active development and polishing.' }] },
          {
            text: '🔲 Table support is partially implemented! Try the table below and play with the toolbar.',
          },
        ],
      },
    ],
  },
  {
    type: 'indent',
    children: [
      {
        type: 'todo',
        checked: false,
        children: [{ text: '🛠️ Table UI on mobile hasn’t been designed yet, and there may still be some potential issues. These will be addressed in future updates.' }],
      },
    ],
  },
  {
    type: 'indent',
    children: [
      {
        type: 'table',
        children: [
          {
            type: 'table-head',
            children: [
              {
                type: 'table-row',
                children: [
                  {
                    type: 'table-header-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: 'Feature' },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'table-header-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: 'Status' },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'table-header-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: 'Examples' },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'table-body',
            children: [
              {
                type: 'table-row',
                children: [
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: 'Tables' },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: '✅ Working' },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: 'Basic CRUD operations supported' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'table-row',
                children: [
                  {
                    type: 'table-cell',
                    children: [{ text: 'Image' }],
                  },
                  {
                    type: 'table-cell',
                    children: [{ text: '✅ Working' }],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'image',
                        url: 'https://github.com/mslxl/wallpapers/blob/main/121308490_p0.jpg?raw=true',
                        children: [{ text: '' }],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'table-row',
                children: [
                  {
                    type: 'table-cell',
                    children: [{
                      type: 'plain',
                      children: [
                        { text: 'Mixed Content' },
                      ],
                    }],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: '✅ Working' },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { type: 'quote', children: [{ text: 'Text with image:' }] },
                          {
                            type: 'image',
                            url: 'https://github.com/mslxl/wallpapers/blob/main/121308490_p0.jpg?raw=true',
                            children: [{ text: '' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'table-row',
                children: [
                  {
                    type: 'table-cell',
                    children: [{
                      type: 'plain',
                      children: [
                        { text: 'Inline Math' },
                      ],
                    }],
                  },
                  {
                    type: 'table-cell',
                    children: [{
                      type: 'plain',
                      children: [
                        { text: '✅ Working' },
                      ],
                    }],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: 'Pythagorean theorem: ' },
                          {
                            type: 'math-inline',
                            children: [{ text: 'a^2 + b^2 = c^2' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'table-row',
                children: [
                  {
                    type: 'table-cell',
                    children: [{
                      type: 'plain',
                      children: [
                        { text: 'Code Snippets' },
                      ],
                    }],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: '✅ Working' },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: 'Use ' },
                          { text: 'console.log()', codesnippet: true },
                          { text: ' for debugging' },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                type: 'table-row',
                children: [
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          { text: 'Block Math' },
                        ],
                      },
                    ],
                  },
                  {
                    type: 'table-cell',
                    children: [{
                      type: 'plain',
                      children: [
                        { text: '✅ Working' },
                      ],
                    }],
                  },
                  {
                    type: 'table-cell',
                    children: [
                      {
                        type: 'plain',
                        children: [
                          {
                            type: 'math-block',
                            children: [{ text: '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}' }],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'plain', children: [{ text: 'This project aims to replicate key features of Notion, the popular productivity tool. This page demonstrates the capabilities of this rich text editor.' }] },
      { text: '🧮 Inline Math Equation Support' },
      {
        type: 'math-inline',
        children: [{
          text: `
          \\frac{
            \\Gamma \\vdash \\phi \\vee \\psi \\; true \\quad \\Gamma, \\phi \\vdash \\chi \\; true \\quad \\Gamma, \\psi \\vdash \\chi \\; true
          }{
            \\Gamma \\vdash \\chi \\; true
          }
          `.trim(),
        }],
      },
      {
        text: 'That is Disjunction Elimination',
      },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'h2', children: [{ text: 'Features' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'plain', children: [{ type: 'todo', checked: true, children: [{ text: '✍️ Essential formatting (' }, { text: 'bold', bold: true }, { text: ', ' }, { italic: true, text: 'italic' }, { text: ', ' }, { text: 'underline', underline: true }, { text: ', ' }, { text: 'strikethrough', strikethrough: true }, { text: ', ' }, { text: 'code snippet', codesnippet: true }, { text: ')' }] }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'plain', children: [{ type: 'todo', checked: true, children: [{ text: '📄 Fundamental blocks (headings, code blocks, quotes, checklists, dividers)' }] }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'plain', children: [{ type: 'todo', checked: true, children: [{ text: '🖼️ Image handling (insert via URL paste 🔗 or drag-and-drop)' }] }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'todo', checked: true, children: [{ text: '🖌️ Floating toolbar (select text or click the side "..." menu)' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'todo', checked: true, children: [{ text: '⌨️ Keyboard shortcuts (hover over toolbar buttons to view shortcuts)' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'todo', checked: false, children: [{ text: '🧮 Inline Math Equation Support' }, { type: 'math-inline', children: [{ text: '\\frac{\n            \\Gamma \\vdash \\phi \\vee \\psi \\; true \\quad \\Gamma, \\phi \\vdash \\chi \\; true \\quad \\Gamma, \\psi \\vdash \\chi \\; true\n          }{\n            \\Gamma \\vdash \\chi \\; true\n          }' }] }, { text: 'That is Disjunction Elimination' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'todo', checked: false, children: [{ type: 'math-block', children: [{ text: '\\frac{\\Gamma \\vdash_W e_0 : \\tau, S_0 \\qquad S_0\\Gamma, x : \\overline{S_0\\Gamma}(\\tau) \\vdash_W e_1 : \\tau\', S_1}{\\Gamma \\vdash_W \\mathbf{let}\\ x = e_0\\ \\mathbf{in}\\ e_1 : \\tau\', S_1 S_0}' }] }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'todo', checked: false, children: [{ text: 'The same as code highlighting' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { children: [{ text: 'Time for a demo!' }], type: 'h3' },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'plain', children: [{ text: 'Try selecting this text and clicking "H1" or pressing ' }, { text: 'Ctrl + 1', codesnippet: true }, { text: '. Hover over buttons to see shortcuts! You can also select text and press ' }, { text: 'Ctrl + B.', codesnippet: true }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'plain', children: [{ text: 'Pressing ' }, { text: 'Enter', codesnippet: true }, { text: ' creates a new block.\nUse ' }, { text: 'Shift + Enter', codesnippet: true }, { text: ' for a soft line break within the block!' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'plain', children: [{ text: 'You can also insert ' }, { text: 'console.log("inline code!")', codesnippet: true }, { text: '. Neat.' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      { type: 'h3', children: [{ text: 'Code block example:' }] },
    ],
  },
  {
    type: 'indent',
    children: [
      {
        type: 'codeblock',
        children: toCodeLines(`
primes = filterPrime [2..] where
  filterPrime (p:xs) =
    p : filterPrime [x | x <- xs, x \`mod\` p /= 0]
        `.trim()),
      },
    ],
  },
  {
    type: 'indent',
    children: [
      {
        type: 'codeblock',
        children: toCodeLines(`
function ciallo(){
    console.log('Ciallo～(∠・ω< )')
}
        `.trim()),
      },
    ],
  },
]

function MemoriloEditable({
  className,
  slashCommandRegistry,
  ...props
}: TextareaHTMLAttributes<HTMLDivElement> & RefAttributes<HTMLDivElement> & { slashCommandRegistry?: Partial<SlashCommandRegistry> }) {
  const editor = useSlateStatic()
  const renderElement = useRenderElement()
  const renderLeaf = useRenderLeaf()
  const handleKeyDown = useKeyDownHandler()
  const defaultRegistry = useMemo(() => createDefaultSlashCommandRegistry(), [])
  const slashCommands = useSlashCommands({ registry: defaultRegistry, extraRegistry: slashCommandRegistry })
  const decorate = useDecorate({ slashTriggerRange: slashCommands.triggerRange })
  return (
    <IndentDragProvider>
      <FormatToolbar />
      {slashCommands.menu}
      <Editable
        autoFocus
        className={cn('w-full py-8 px-2 md:p-8 memorilo-editor', className)}
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        onKeyDown={(event) => {
          if (slashCommands.onKeyDown(event))
            return
          handleKeyDown(event)
        }}
        decorate={decorate}
        onDragStart={() => {
          if (TableCursor.isInTable(editor))
            return true
          return false
        }}
        {...props}
      />
    </IndentDragProvider>
  )
}

interface MemoriloEditorProps extends TextareaHTMLAttributes<HTMLDivElement>, RefAttributes<HTMLDivElement> {
  outline?: boolean
  slashCommandRegistry?: Partial<SlashCommandRegistry>
}

export function MemoriloEditor({ outline, slashCommandRegistry, ...props }: MemoriloEditorProps) {
  const [canMerge, setCanMerge] = useState(false)
  const editor = useMemo(() => {
    const baseEditor = withReact(createEditor())
    const plugins = [
      withHistory,
      withImages,
      withCodeblock,
      withMath,
      withTodo,
      withIndent,
      withLink,
      withTable,
    ] as const
    return plugins.reduce((editor, plugin) => plugin(editor), baseEditor)
  }, [])

  return (
    <TableProvider canMerge={canMerge}>
      <ToolbarProvider>
        <RootIndentEnableContext enable={outline ?? true}>
          <Slate
            editor={editor}
            initialValue={initialValue}
            onSelectionChange={() => setCanMerge(TableEditor.canMerge(editor))}
          >
            <MemoriloEditable {...props} slashCommandRegistry={slashCommandRegistry} />
          </Slate>
        </RootIndentEnableContext>
      </ToolbarProvider>
    </TableProvider>
  )
}
