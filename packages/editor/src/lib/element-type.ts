import type { CodeBlockElementType, CodeLineElementType, MathBlockElementType, MathInlineElementType, MemoriloText } from '../slate'
import { Text } from 'slate'

export function isCodeblock(element: any): element is CodeBlockElementType {
  return element && element.type === 'codeblock'
}

export function isCodeLine(element: any): element is CodeLineElementType {
  return element && element.type === 'code-line'
}

export function isText(element: any): element is MemoriloText {
  return Text.isText(element)
}

export function isMathInline(element: any): element is MathInlineElementType {
  return element && element.type === 'math-inline'
}

export function isMathBlock(element: any): element is MathBlockElementType {
  return element && element.type === 'math-block'
}

export function isMath(element: any): element is MathInlineElementType | MathBlockElementType {
  return isMathInline(element) || isMathBlock(element)
}
