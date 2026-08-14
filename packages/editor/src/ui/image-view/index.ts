import type { Extension } from 'prosekit/core'
import type { ReactNodeViewComponent } from 'prosekit/react'
import type { EditorImageOcclusionIntegration } from '../../image-occlusion/image-occlusion-model'
import { defineReactNodeView } from 'prosekit/react'
import { createElement } from 'react'

import ImageView from './image-view.tsx'

export function defineImageView(imageOcclusion?: EditorImageOcclusionIntegration): Extension {
  return defineReactNodeView({
    name: 'image',
    component: (props => createElement(ImageView, { ...props, imageOcclusion })) satisfies ReactNodeViewComponent,
  })
}
