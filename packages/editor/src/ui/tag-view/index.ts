import type { Extension } from 'prosekit/core'
import type { ReactNodeViewComponent } from 'prosekit/react'
import type { TagRuntime } from '../../tag/tag-runtime'
import { defineReactNodeView } from 'prosekit/react'
import { createElement } from 'react'

import TagView from './tag-view'

export function defineTagView(runtime: TagRuntime): Extension {
  const component: ReactNodeViewComponent = props => createElement(TagView, { ...props, runtime })

  return defineReactNodeView({
    name: 'tag',
    component,
    stopEvent: event => event.target instanceof Element && Boolean(event.target.closest('[data-tag-interactive]')),
  })
}
