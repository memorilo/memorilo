import type { FC } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { MemoriloElementStrings } from '../../slate'
import { DefaultElement } from 'slate-react'
import { CodeBlock as CodeBlockElement, CodeLine as CodeLineElement } from './code-block'
import { Heading as HeadingElement } from './heading'
import { Image as ImageElement } from './image'
import { Indent as IndentElement } from './indent'
import { MathBlock as MathBlockElement, MathInline as MathInlineElement } from './math'
import { Quote as QuoteElement } from './quote'
import { Todo as TodoElement } from './todo'

type ElementMap = Record<MemoriloElementStrings, FC<RenderElementProps>>

export const ELEMENTS: ElementMap = {
  'plain': DefaultElement,
  'h1': props => <HeadingElement headingSize={1} {...props} />,
  'h2': props => <HeadingElement headingSize={2} {...props} />,
  'h3': props => <HeadingElement headingSize={3} {...props} />,
  'h4': props => <HeadingElement headingSize={4} {...props} />,
  'h5': props => <HeadingElement headingSize={5} {...props} />,
  'h6': props => <HeadingElement headingSize={6} {...props} />,
  'codeblock': CodeBlockElement,
  'code-line': CodeLineElement,
  'quote': QuoteElement,
  'todo': TodoElement,
  'image': ImageElement,
  'math-inline': MathInlineElement,
  'math-block': MathBlockElement,
  'indent': IndentElement,
}
