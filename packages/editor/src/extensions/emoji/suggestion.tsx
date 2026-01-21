import type { EmojiItem } from '@tiptap/extension-emoji'
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion'
import type { EmojiListRef } from './emoji-list'
import { computePosition, flip, offset, shift } from '@floating-ui/dom'
import { gitHubEmojis } from '@tiptap/extension-emoji'
import { ReactRenderer } from '@tiptap/react'
import { EmojiList } from './emoji-list'

interface FloatingElement {
  element: HTMLElement
  cleanup: () => void
}

function createFloatingElement(
  props: SuggestionProps<EmojiItem>,
  component: ReactRenderer<EmojiListRef>,
): FloatingElement {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'absolute'
  wrapper.style.zIndex = '50'
  wrapper.appendChild(component.element as HTMLElement)
  document.body.appendChild(wrapper)

  const updatePosition = () => {
    if (!props.clientRect)
      return

    const virtualElement = {
      getBoundingClientRect: props.clientRect as () => DOMRect,
    }

    computePosition(virtualElement, wrapper, {
      placement: 'bottom-start',
      middleware: [offset(8), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      Object.assign(wrapper.style, {
        left: `${x}px`,
        top: `${y}px`,
      })
    })
  }

  updatePosition()

  return {
    element: wrapper,
    cleanup: () => {
      wrapper.remove()
    },
  }
}

export const emojiSuggestion: Omit<SuggestionOptions<EmojiItem>, 'editor'> = {
  items: ({ query }) => {
    return gitHubEmojis
      .filter(emoji =>
        emoji.name.toLowerCase().includes(query.toLowerCase())
        || emoji.shortcodes.some(sc => sc.toLowerCase().includes(query.toLowerCase()))
        || emoji.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase())),
      )
      .slice(0, 10)
  },

  render: () => {
    let component: ReactRenderer<EmojiListRef> | null = null
    let floating: FloatingElement | null = null

    return {
      onStart: (props: SuggestionProps<EmojiItem>) => {
        component = new ReactRenderer(EmojiList, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) {
          return
        }

        floating = createFloatingElement(props, component)
      },

      onUpdate(props: SuggestionProps<EmojiItem>) {
        component?.updateProps(props)

        if (!props.clientRect || !floating) {
          return
        }

        const virtualElement = {
          getBoundingClientRect: props.clientRect as () => DOMRect,
        }

        computePosition(virtualElement, floating.element, {
          placement: 'bottom-start',
          middleware: [offset(8), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => {
          Object.assign(floating!.element.style, {
            left: `${x}px`,
            top: `${y}px`,
          })
        })
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
  },
}
