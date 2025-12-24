import type { CodeBlockElementType, CodeLineElementType, IndentElementType, LinkElementType, MathBlockElementType, MathInlineElementType, MemoriloText, TodoElementType } from '../slate'
import { Text } from 'slate'

function hasElementType(value: unknown): value is { type: unknown } {
  return typeof value === 'object' && value !== null && 'type' in value
}

/**
 * Type guard for `codeblock` elements.
 */
export function isCodeblock(element: unknown): element is CodeBlockElementType {
  return hasElementType(element) && element.type === 'codeblock'
}

/**
 * Type guard for `code-line` elements.
 */
export function isCodeLine(element: unknown): element is CodeLineElementType {
  return hasElementType(element) && element.type === 'code-line'
}

/**
 * Type guard for `todo` elements.
 */
export function isTodo(element: unknown): element is TodoElementType {
  return hasElementType(element) && element.type === 'todo'
}

/**
 * Type guard for Slate text nodes (with Memorilo marks).
 */
export function isText(element: unknown): element is MemoriloText {
  return Text.isText(element)
}

/**
 * Type guard for inline math elements.
 */
export function isMathInline(element: unknown): element is MathInlineElementType {
  return hasElementType(element) && element.type === 'math-inline'
}

/**
 * Type guard for block math elements.
 */
export function isMathBlock(element: unknown): element is MathBlockElementType {
  return hasElementType(element) && element.type === 'math-block'
}

/**
 * Type guard for any math element (inline or block).
 */
export function isMath(element: unknown): element is MathInlineElementType | MathBlockElementType {
  return isMathInline(element) || isMathBlock(element)
}

/**
 * Type guard for outline `indent` containers.
 */
export function isIndent(element: unknown): element is IndentElementType {
  return hasElementType(element) && element.type === 'indent'
}

/**
 * Type guard for link elements.
 */
export function isLink(element: unknown): element is LinkElementType {
  return hasElementType(element) && element.type === 'link'
}

/**
 * Block types that behave like "text blocks" in the editor.
 * Used by toolbar transforms and selection logic.
 */
export const HEADING_AND_PLAIN_TYPES = ['plain', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

/**
 * Union type for headings and plain paragraphs.
 */
export type HeadingOrPlainType = typeof HEADING_AND_PLAIN_TYPES[number]

/**
 * Runtime type guard for {@link HeadingOrPlainType}.
 */
export function isHeadingOrPlainType(type: unknown): type is HeadingOrPlainType {
  return typeof type === 'string' && (HEADING_AND_PLAIN_TYPES as readonly string[]).includes(type)
}
