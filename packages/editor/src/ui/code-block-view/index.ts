import type { Extension } from 'prosekit/core'
import type { ReactNodeViewComponent } from 'prosekit/react'
import { defineReactNodeView } from 'prosekit/react'

import CodeBlockView from './code-block-view.tsx'

export function defineCodeBlockView(): Extension {
  return defineReactNodeView({
    name: 'codeBlock',
    contentAs: 'code',
    component: CodeBlockView satisfies ReactNodeViewComponent,
  })
}
