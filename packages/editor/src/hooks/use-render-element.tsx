import type { RenderElementProps } from 'slate-react'
import { useCallback } from 'react'
import { ELEMENTS } from '../components/elements'

export function useRenderElement() {
  return useCallback((props: RenderElementProps) => {
    const Element
      = props.element.type === undefined ? ELEMENTS.plain : ELEMENTS[props.element.type]
    return <Element {...props} />
  }, [])
}
