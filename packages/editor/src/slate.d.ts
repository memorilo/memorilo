import type { BaseEditor, Descendant } from 'slate'
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
  type: 'code'
  children: Descendant[]
}

export interface DividerElementType {
  type: 'divider'
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
  children: Descendant[]
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
    | DividerElementType
    | TodoElementType
    | ImageElementType

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
  }

  export interface BaseElement {
    type: MemoriloElementStrings
  }
}
