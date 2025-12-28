import type {
  CodeBlockElementType,
  CodeLineElementType,
  IndentElementType,
  LinkElementType,
  MathBlockElementType,
  MathInlineElementType,
  MemoriloText,
  TableBodyElementType,
  TableCellElementType,
  TableContentElementType,
  TableElementType,
  TableFooterElementType,
  TableHeadElementType,
  TableHeaderCellElementType,
  TableRowElementType,
  TodoElementType,
} from '../slate'

import { Text } from 'slate'
import { TABLE_BLOCKS } from './table-operations'

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

/**
 * Type guard for table elements (the root table container).
 */
export function isTable(element: any): element is TableElementType {
  return element && element.type === TABLE_BLOCKS.table
}

/**
 * Type guard for table section elements (thead, tbody, or tfoot).
 * Matches any of the three table section types.
 */
export function isTableSection(element: any): element is TableHeadElementType | TableBodyElementType | TableFooterElementType {
  return element && [TABLE_BLOCKS.thead, TABLE_BLOCKS.tbody, TABLE_BLOCKS.tfoot].includes(element.type)
}

/**
 * Type guard for table-head section elements.
 * The header section typically contains column titles.
 */
export function isTableHead(element: any): element is TableHeadElementType {
  return element && element.type === TABLE_BLOCKS.thead
}

/**
 * Type guard for table-body section elements.
 * The body section contains the main data rows.
 */
export function isTableBody(element: any): element is TableBodyElementType {
  return element && element.type === TABLE_BLOCKS.tbody
}

/**
 * Type guard for table-footer section elements.
 * The footer section typically contains summary or totals.
 */
export function isTableFooter(element: any): element is TableFooterElementType {
  return element && element.type === TABLE_BLOCKS.tfoot
}

/**
 * Type guard for table row elements.
 * Rows contain table cells and exist within table sections.
 */
export function isTableRow(element: any): element is TableRowElementType {
  return element && element.type === TABLE_BLOCKS.tr
}

/**
 * Type guard for table cell elements (both th and td).
 * Matches both header cells and regular data cells.
 */
export function isTableCell(element: any): element is TableCellElementType | TableHeaderCellElementType {
  return element && (element.type === TABLE_BLOCKS.td || element.type === TABLE_BLOCKS.th)
}

/**
 * Type guard for table header cell elements (th).
 * Header cells are typically used in the thead section for column titles.
 */
export function isTableHeaderCell(element: any): element is TableHeaderCellElementType {
  return element && element.type === TABLE_BLOCKS.th
}

/**
 * Type guard for table data cell elements (td).
 * Data cells are the regular cells containing table content.
 */
export function isTableDataCell(element: any): element is TableCellElementType {
  return element && element.type === TABLE_BLOCKS.td
}

/**
 * Type guard for table content elements.
 * Content elements are the containers for text within table cells.
 */
export function isTableContent(element: any): element is TableContentElementType {
  return element && element.type === TABLE_BLOCKS.content
}