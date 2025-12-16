import type { CodeBlockElementType, CodeLineElementType } from '../slate'

export function isCodeblock(element: any): element is CodeBlockElementType {
  return element && element.type === 'codeblock'
}

export function isCodeLine(element: any): element is CodeLineElementType {
  return element && element.type === 'code-line'
}
