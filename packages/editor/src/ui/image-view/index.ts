import type { Extension } from 'prosekit/core'
import type { ReactNodeViewComponent } from 'prosekit/react'
import { defineReactNodeView } from 'prosekit/react'

import ImageView from './image-view.tsx'

export function defineImageView(): Extension {
  return defineReactNodeView({
    name: 'image',
    component: ImageView satisfies ReactNodeViewComponent,
  })
}
