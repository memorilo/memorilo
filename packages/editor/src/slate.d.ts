import type { BaseEditor, BaseRange, Descendant } from 'slate'
import type { HistoryEditor } from 'slate-history'
import type { ReactEditor } from 'slate-react'

export interface PlainElementType {
  type: 'plain'
  children: Descendant[]
}

export interface H1ElementType {
  type: 'h1'
  children: Descendant[]
}

export interface H2ElementType {
  type: 'h2'
  children: Descendant[]
}

export interface H3ElementType {
  type: 'h3'
  children: Descendant[]
}

export interface H4ElementType {
  type: 'h4'
  children: Descendant[]
}

export interface H5ElementType {
  type: 'h5'
  children: Descendant[]
}

export interface H6ElementType {
  type: 'h6'
  children: Descendant[]
}

export interface QuoteElementType {
  type: 'quote'
  children: Descendant[]
}

export interface CodeBlockElementType {
  type: 'codeblock'
  language?: string
  guessLanguage?: string
  children: Descendant[]
}

export interface CodeLineElementType {
  type: 'code-line'
  children: Descendant[]
}

export interface TodoElementType {
  type: 'todo'
  checked: boolean
  children: Descendant[]
}

export interface ImageElementType {
  type: 'image'
  url: string
  width?: number
  height?: number
  children: Descendant[]
}

export interface MathInlineElementType {
  type: 'math-inline'
  children: Descendant[]
}

export interface MathBlockElementType {
  type: 'math-block'
  children: Descendant[]
}

export interface IndentElementType {
  type: 'indent'
  children: Descendant[]
}

export interface LinkElementType {
  type: 'link'
  url: string
  children: Descendant[]
}
export interface TableElementType {
  type: 'table'
  children: Array<TableHeadElementType | TableBodyElementType | TableFooterElementType>
}

export interface TableHeadElementType {
  type: 'table-head'
  children: TableRowElementType[]
}

export interface TableBodyElementType {
  type: 'table-body'
  children: TableRowElementType[]
}

export interface TableFooterElementType {
  type: 'table-footer'
  children: TableRowElementType[]
}

export interface TableRowElementType {
  type: 'table-row'
  children: Array<TableCellElementType | TableHeaderCellElementType>
}

interface TableCellBase {
  rowSpan?: number
  colSpan?: number
  children: Array<MemoriloElement | MemoriloText>
}

export interface TableCellElementType extends TableCellBase {
  type: 'table-cell'
}

export interface TableHeaderCellElementType extends TableCellBase {
  type: 'table-header-cell'
}

type MemoriloElement
  = | PlainElementType
    | H1ElementType
    | H2ElementType
    | H3ElementType
    | H4ElementType
    | H5ElementType
    | H6ElementType
    | QuoteElementType
    | CodeBlockElementType
    | CodeLineElementType
    | TodoElementType
    | ImageElementType
    | MathInlineElementType
    | MathBlockElementType
    | IndentElementType
    | LinkElementType
    | TableElementType
    | TableHeadElementType
    | TableBodyElementType
    | TableFooterElementType
    | TableRowElementType
    | TableCellElementType
    | TableHeaderCellElementType
    | TableContentElementType

export type MemoriloElementStrings = MemoriloElement['type']

export interface MemoriloMarkup {
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  codesnippet: boolean
}

export type MemoriloMarkupStrings = keyof MemoriloMarkup

export type MemoriloText = Partial<MemoriloMarkup> & {
  text: string
  placeholder?: boolean
}

export type MemoriloEditor = BaseEditor & ReactEditor & HistoryEditor

declare module 'slate' {
  interface CustomTypes {
    Editor: MemoriloEditor
    Element: MemoriloElement
    Text: MemoriloText
    Range: BaseRange & {
      [key: string]: unknown
    }
  }

  export interface BaseElement {
    type: MemoriloElementStrings
  }
}
