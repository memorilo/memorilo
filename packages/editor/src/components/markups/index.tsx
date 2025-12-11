import type { JSX } from 'react'
import type { MemoriloMarkupStrings } from '../../slate'
import { BoldIcon } from '@memorilo/components/ui/animiated-icons/bold'
import { ItalicIcon } from '@memorilo/components/ui/animiated-icons/italic'
import { StrikethroughIcon } from '@memorilo/components/ui/animiated-icons/strikethrough'
import { TerminalIcon } from '@memorilo/components/ui/animiated-icons/terminal'
import { UnderlineIcon } from '@memorilo/components/ui/animiated-icons/underline'

interface MarkupMetadata {
  key: string[]
  symbol: string | JSX.Element
  className: string
}

type MarkupMap = Record<MemoriloMarkupStrings, MarkupMetadata>

export const MARKUPS: MarkupMap = {
  bold: {
    key: ['ctrl', 'b'],
    symbol: <BoldIcon size={16} />,
    className: 'font-bold',
  },
  italic: {
    key: ['ctrl', 'i'],
    symbol: <ItalicIcon size={16} />,
    className: 'italic',
  },
  underline: {
    key: ['ctrl', 'u'],
    symbol: <UnderlineIcon size={16} />,
    className: 'underline',
  },
  strikethrough: {
    key: ['ctrl', 's'],
    symbol: <StrikethroughIcon size={16} />,
    className: 'line-through',
  },
  codesnippet: {
    key: ['ctrl', '`'],
    symbol: <TerminalIcon size={16} />,
    className: 'font-mono text-red-500 text-sm py-1 px-1.5 mx-0.5 bg-gray-100 rounded',
  },
}
