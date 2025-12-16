import type { CodeLineElementType } from '../slate'

function toChildren(content: string) {
  return [{ text: content }]
}

export function toCodeLines(content: string): CodeLineElementType[] {
  return content
    .split('\n')
    .map(line => ({ type: 'code-line', children: toChildren(line) }))
}
