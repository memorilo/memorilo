import type { JSX } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { MemoriloElementStrings } from '../../slate'
import { LuFileImage } from 'react-icons/lu'
import { Editor, Transforms } from 'slate'
import { DefaultElement } from 'slate-react'
import { CodeBlock as CodeBlockElement } from './code-block'
import { Divider as DividerElement } from './divider'
import { Heading as HeadingElement } from './heading'
import { Image as ImageElement } from './image'
import { Quote as QuoteElement } from './quote'
import { Todo as TodoElement } from './todo'

interface ElementMetadata {
  key: string[]
  symbol: string | JSX.Element
  afterClick?: (editor: Editor) => void
  component: (x: RenderElementProps) => JSX.Element
}

type ElementMap = Record<MemoriloElementStrings, ElementMetadata>

export const ELEMENTS: ElementMap = {
  plain: {
    key: ['ctrl', 'k'],
    symbol: '¶',
    component: DefaultElement,
  },
  h1: {
    key: ['ctrl', '1'],
    symbol: 'H1',
    component: props => <HeadingElement headingSize={1} {...props} />,
  },
  h2: {
    key: ['ctrl', '2'],
    symbol: 'H2',
    component: props => <HeadingElement headingSize={2} {...props} />,
  },
  h3: {
    key: ['ctrl', '3'],
    symbol: 'H3',
    component: props => <HeadingElement headingSize={3} {...props} />,
  },
  h4: {
    key: ['ctrl', '4'],
    symbol: 'H4',
    component: props => <HeadingElement headingSize={4} {...props} />,
  },
  h5: {
    key: ['ctrl', '5'],
    symbol: 'H5',
    component: props => <HeadingElement headingSize={5} {...props} />,
  },
  h6: {
    key: ['ctrl', '6'],
    symbol: 'H6',
    component: props => <HeadingElement headingSize={6} {...props} />,
  },
  code: {
    key: ['ctrl', '/'],
    symbol: <span className="font-mono text-sm">&lt;/&gt;</span>,
    component: CodeBlockElement,
  },
  quote: {
    key: ['ctrl', 'q'],
    symbol: '❝',
    component: QuoteElement,
  },
  divider: {
    key: ['ctrl', 'd'],
    symbol: '―',
    component: DividerElement,
    afterClick: (editor: Editor) => {
      if (!editor.selection)
        return
      const currentSelection = Editor.unhangRange(editor, editor.selection)
      Transforms.select(editor, { path: [currentSelection.anchor.path[0] + 1, 0], offset: 0 })
    },
  },
  todo: {
    key: ['ctrl', 't'],
    symbol: '☑',
    component: TodoElement,
  },
  image: {
    key: ['ctrl', 'm'],
    symbol: <LuFileImage size={16} />,
    component: ImageElement,
  },
}
