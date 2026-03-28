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

function getEmojiMatchScore(emoji: EmojiItem, normalizedQuery: string) {
  const emojiName = emoji.name.toLowerCase()
  const normalizedShortcodes = emoji.shortcodes.map(shortcode => shortcode.toLowerCase())
  const normalizedTags = emoji.tags.map(tag => tag.toLowerCase())

  if (emojiName === normalizedQuery || normalizedShortcodes.includes(normalizedQuery)) {
    return 0
  }

  if (
    emojiName.startsWith(normalizedQuery)
    || normalizedShortcodes.some(shortcode => shortcode.startsWith(normalizedQuery))
  ) {
    return 1
  }

  if (
    emojiName.includes(normalizedQuery)
    || normalizedShortcodes.some(shortcode => shortcode.includes(normalizedQuery))
  ) {
    return 2
  }

  if (normalizedTags.some(tag => tag.startsWith(normalizedQuery))) {
    return 3
  }

  if (normalizedTags.some(tag => tag.includes(normalizedQuery))) {
    return 4
  }

  return Number.POSITIVE_INFINITY
}

function updateFloatingPosition(
  props: SuggestionProps<EmojiItem>,
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
  props: SuggestionProps<EmojiItem>,
  component: ReactRenderer<EmojiListRef>,
): FloatingElement {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'absolute'
  wrapper.style.zIndex = '50'
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

export const emojiSuggestion: Omit<SuggestionOptions<EmojiItem>, 'editor'> = {
  items: ({ query }) => {
    const normalizedQuery = query.toLowerCase()

    return gitHubEmojis
      .map(emoji => ({
        emoji,
        score: getEmojiMatchScore(emoji, normalizedQuery),
      }))
      .filter(entry => Number.isFinite(entry.score))
      .sort((left, right) => {
        if (left.score !== right.score) {
          return left.score - right.score
        }

        return left.emoji.name.localeCompare(right.emoji.name)
      })
      .map(entry => entry.emoji)
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
        floating = null
        component?.destroy()
        component = null
      },
    }
  },
}
