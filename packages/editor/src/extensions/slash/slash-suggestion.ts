import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import type { SlashMenuRef } from './slash-menu'
import type { SlashCommand } from './slash-types'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { ReactRenderer } from '@tiptap/react'
import { SlashMenu } from './slash-menu'

interface FloatingElement {
  element: HTMLElement
  cleanup: () => void
}

function updateFloatingPosition(
  props: SuggestionProps<SlashCommand>,
  floating: FloatingElement,
) {
  if (!props.clientRect) {
    return
  }

  const virtualElement = {
    getBoundingClientRect: props.clientRect as () => DOMRect,
  }

  computePosition(virtualElement, floating.element, {
    placement: 'bottom-start',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    Object.assign(floating.element.style, {
      left: `${x}px`,
      top: `${y}px`,
    })
  })
}

function createFloatingElement(
  props: SuggestionProps<SlashCommand>,
  component: ReactRenderer<SlashMenuRef>,
): FloatingElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'slash-menu-floating'
  wrapper.appendChild(component.element as HTMLElement)
  document.body.appendChild(wrapper)

  const floating = {
    element: wrapper,
    cleanup: () => {
      wrapper.remove()
    },
  }

  updateFloatingPosition(props, floating)

  return floating
}

export const slashSuggestionRenderer: SuggestionOptions<SlashCommand>['render'] = () => {
  let component: ReactRenderer<SlashMenuRef> | null = null
  let floating: FloatingElement | null = null

  return {
    onStart: (props: SuggestionProps<SlashCommand>) => {
      component = new ReactRenderer(SlashMenu, {
        props,
        editor: props.editor,
      })

      if (!props.clientRect) {
        return
      }

      floating = createFloatingElement(props, component)
    },

    onUpdate(props: SuggestionProps<SlashCommand>) {
      component?.updateProps(props)

      if (!floating) {
        return
      }

      updateFloatingPosition(props, floating)
    },

    onKeyDown(props: { event: KeyboardEvent }) {
      if (props.event.key === 'Escape') {
        floating?.cleanup()
        floating = null
        return true
      }

      return component?.ref?.onKeyDown(props) ?? false
    },

    onExit() {
      floating?.cleanup()
      component?.destroy()
    },
  }
}
