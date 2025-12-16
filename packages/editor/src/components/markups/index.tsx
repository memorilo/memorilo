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
}

type MarkupMap = Record<MemoriloMarkupStrings, MarkupMetadata>

export const MARKUPS: MarkupMap = {
  bold: {
    key: ['ctrl', 'b'],
    symbol: <BoldIcon size={16} />,
  },
  italic: {
    key: ['ctrl', 'i'],
    symbol: <ItalicIcon size={16} />,
  },
  underline: {
    key: ['ctrl', 'u'],
    symbol: <UnderlineIcon size={16} />,
  },
  strikethrough: {
    key: ['ctrl', 's'],
    symbol: <StrikethroughIcon size={16} />,
  },
  codesnippet: {
    key: ['ctrl', '`'],
    symbol: <TerminalIcon size={16} />,
  },
}
