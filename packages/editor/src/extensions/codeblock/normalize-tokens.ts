/**
 * Copied from prism-react-renderer repo
 * https://github.com/FormidableLabs/prism-react-renderer/blob/master/src/utils/normalizeTokens.js
 */

import type Prism from 'prismjs'

type PrismToken = Prism.Token
export interface Token {
  types: string[]
  content: string
  empty?: boolean
}

const newlineRe = /\r\n|\r|\n/

// Empty lines need to contain a single empty token, denoted with { empty: true }
function normalizeEmptyLines(line: Token[]) {
  if (line.length === 0) {
    line.push({
      types: ['plain'],
      content: '\n',
      empty: true,
    })
  }
  else if (line.length === 1) {
    const first = line[0]
    if (first && first.content === '') {
      first.content = '\n'
      first.empty = true
    }
  }
}

function appendTypes(types: string[], add: string[] | string): string[] {
  const typesSize = types.length
  if (typesSize > 0 && types[typesSize - 1] === add) {
    return types
  }

  return types.concat(add)
}

// Takes an array of Prism's tokens and groups them by line, turning plain
// strings into tokens as well. Tokens can become recursive in some cases,
// which means that their types are concatenated. Plain-string tokens however
// are always of type "plain".
// This is not recursive to avoid exceeding the call-stack limit, since it's unclear
// how nested Prism's tokens can become
export function normalizeTokens(tokens: Array<PrismToken | string>): Token[][] {
  // Use explicit stack frames to keep nested token traversal iterative and safe.
  const stack: Array<{
    tokens: Array<PrismToken | string>
    index: number
    types: string[]
  }> = [{ tokens, index: 0, types: [] }]
  let currentLine: Token[] = []

  const acc = [currentLine]

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]
    if (!frame) {
      break
    }

    if (frame.index >= frame.tokens.length) {
      stack.pop()
      continue
    }

    const token = frame.tokens[frame.index]
    frame.index += 1
    if (typeof token === 'undefined') {
      continue
    }

    let content
    let types = frame.types

    // Determine content and append type to types if necessary
    if (typeof token === 'string') {
      types = stack.length > 1 ? types : ['plain']
      content = token
    }
    else {
      types = appendTypes(types, token.type)
      if (token.alias) {
        types = appendTypes(types, token.alias)
      }

      content = token.content
    }

    // If token.content is an array, increase the stack depth and repeat this while-loop
    if (typeof content !== 'string') {
      const nestedTokens = Array.isArray(content) ? content : [content]
      stack.push({ tokens: nestedTokens, index: 0, types })
      continue
    }

    // Split by newlines
    const splitByNewlines = content.split(newlineRe)
    const newlineCount = splitByNewlines.length

    const firstChunk = splitByNewlines[0] ?? ''
    currentLine.push({ types, content: firstChunk })

    // Create a new line for each string on a new line
    for (let i = 1; i < newlineCount; i++) {
      normalizeEmptyLines(currentLine)
      acc.push((currentLine = []))
      const chunk = splitByNewlines[i] ?? ''
      currentLine.push({ types, content: chunk })
    }
  }

  normalizeEmptyLines(currentLine)
  return acc
}
