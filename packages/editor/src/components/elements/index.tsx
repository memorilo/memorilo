import type { FC, JSX } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { MemoriloElementStrings } from '../../slate'
import { LuFileImage } from 'react-icons/lu'
import { Editor, Transforms } from 'slate'
import { DefaultElement } from 'slate-react'
import { CodeBlock as CodeBlockElement, CodeLine as CodeLineElement } from './code-block'
import { Divider as DividerElement } from './divider'
import { Heading as HeadingElement } from './heading'
import { Image as ImageElement } from './image'
import { MathBlock as MathBlockElement, MathInline as MathInlineElement } from './math'
import { Quote as QuoteElement } from './quote'
import { Todo as TodoElement } from './todo'

interface ElementMetadata {
  key: string[]
  symbol: string | JSX.Element
  showUtil?: boolean
  afterClick?: (editor: Editor) => void
  component: FC<RenderElementProps>
}

type ElementMap = Record<MemoriloElementStrings, ElementMetadata>

export const ELEMENTS: ElementMap = {
  'plain': {
    key: ['ctrl', 'k'],
    symbol: '¶',
    showUtil: true,
    component: DefaultElement,
  },
  'h1': {
    key: ['ctrl', '1'],
    symbol: 'H1',
    showUtil: true,
    component: props => <HeadingElement headingSize={1} {...props} />,
  },
  'h2': {
    key: ['ctrl', '2'],
    symbol: 'H2',
    showUtil: true,
    component: props => <HeadingElement headingSize={2} {...props} />,
  },
  'h3': {
    key: ['ctrl', '3'],
    symbol: 'H3',
    showUtil: true,
    component: props => <HeadingElement headingSize={3} {...props} />,
  },
  'h4': {
    key: ['ctrl', '4'],
    symbol: 'H4',
    showUtil: true,
    component: props => <HeadingElement headingSize={4} {...props} />,
  },
  'h5': {
    key: ['ctrl', '5'],
    symbol: 'H5',
    showUtil: true,
    component: props => <HeadingElement headingSize={5} {...props} />,
  },
  'h6': {
    key: ['ctrl', '6'],
    symbol: 'H6',
    showUtil: true,
    component: props => <HeadingElement headingSize={6} {...props} />,
  },
  'codeblock': {
    key: ['ctrl', '/'],
    showUtil: true,
    symbol: <span className="font-mono text-sm">&lt;/&gt;</span>,
    component: CodeBlockElement,
  },
  'code-line': {
    key: ['ctrl', '|'],
    symbol: 'I',
    component: CodeLineElement,
  },
  'quote': {
    key: ['ctrl', 'q'],
    showUtil: true,
    symbol: '❝',
    component: QuoteElement,
  },
  'divider': {
    key: ['ctrl', 'd'],
    symbol: '―',
    showUtil: true,
    component: DividerElement,
    afterClick: (editor: Editor) => {
      if (!editor.selection)
        return
      const currentSelection = Editor.unhangRange(editor, editor.selection)
      Transforms.select(editor, { path: [currentSelection.anchor.path[0] + 1, 0], offset: 0 })
    },
  },
  'todo': {
    key: ['ctrl', 't'],
    symbol: '☑',
    showUtil: true,
    component: TodoElement,
  },
  'image': {
    key: ['ctrl', 'm'],
    showUtil: true,
    symbol: <LuFileImage size={16} />,
    component: ImageElement,
  },
  'math-inline': {
    key: ['ctrl', 'm'],
    symbol: 'M',
    component: MathInlineElement,
  },
  'math-block': {
    key: ['ctrl', 'shift', 'm'],
    symbol: 'MB',
    component: MathBlockElement,
  },
}
