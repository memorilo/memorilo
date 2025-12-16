import type { RenderElementProps } from 'slate-react'
import { useCallback } from 'react'
import { ElementWrapper } from '../components/element-wrapper'
import { ELEMENTS } from '../components/elements'

export function useRenderElement() {
  return useCallback((props: RenderElementProps) => {
    const Element
      = props.element.type === undefined ? ELEMENTS.plain.component : ELEMENTS[props.element.type].component

    const showUtil
      = props.element.type !== undefined && ELEMENTS[props.element.type].showUtil
    if (showUtil) {
      return (
        <ElementWrapper {...props}>
          <Element {...props} />
        </ElementWrapper>
      )
    }
    else {
      return <Element {...props} />
    }
  }, [])
}
