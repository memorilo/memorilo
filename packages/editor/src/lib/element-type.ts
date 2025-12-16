import type { CodeBlockElementType, CodeLineElementType, MemoriloText } from '../slate'
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
