import type { EmojiItem } from '@tiptap/extension-emoji'
import type { SuggestionProps } from '@tiptap/suggestion'
import type { EmojiClickData } from 'emoji-picker-react'
import { gitHubEmojis } from '@tiptap/extension-emoji'
import EmojiPicker, { EmojiStyle, Theme } from 'emoji-picker-react'
import { useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

const PICKER_SEARCH_INPUT_SELECTOR = 'input[aria-label="Type to search for an emoji"]'
const PICKER_EMOJI_BUTTON_SELECTOR = 'button.epr-emoji'

export interface EmojiListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

export interface EmojiListProps extends SuggestionProps<EmojiItem> {
  ref?: React.RefObject<EmojiListRef | null>
}

function normalizeEmojiName(value: string) {
  return value.trim().toLowerCase().replaceAll(' ', '_')
}

function stripEmojiVariationSelectors(value: string) {
  return value.replaceAll('\uFE0E', '').replaceAll('\uFE0F', '')
}

function toEmojiUnified(value: string) {
  const normalizedValue = value.trim().normalize('NFC')
  if (!normalizedValue) {
    throw new Error('Unable to build unified code for an empty emoji')
  }

  return Array.from(normalizedValue).map((symbol) => {
    const codePoint = symbol.codePointAt(0)
    if (codePoint === undefined) {
      throw new Error(`Unable to resolve code point for emoji ${value}`)
    }

    return codePoint.toString(16)
  }).join('-')
}

function getEmojiUnifiedCandidates(value: string) {
  const normalizedValue = value.trim().normalize('NFC')
  const strippedValue = stripEmojiVariationSelectors(normalizedValue)

  return new Set([normalizedValue, strippedValue].filter(Boolean).map(toEmojiUnified))
}

function resolveEmojiTheme(root: HTMLElement | null) {
  return !!root?.closest('.dark') || document.documentElement.classList.contains('dark')
    ? Theme.DARK
    : Theme.LIGHT
}

function findPickerSearchInput(root: HTMLElement) {
  const searchInput = root.querySelector<HTMLInputElement>(PICKER_SEARCH_INPUT_SELECTOR)
  if (!searchInput) {
    throw new Error('Emoji picker search input not found')
  }

  return searchInput
}

function findEmojiButton(root: HTMLElement, item: EmojiItem) {
  const normalizedName = normalizeEmojiName(item.name)

  return Array.from(root.querySelectorAll<HTMLButtonElement>(PICKER_EMOJI_BUTTON_SELECTOR)).find((button) => {
    const ariaLabel = button.getAttribute('aria-label')
    return ariaLabel !== null && normalizeEmojiName(ariaLabel) === normalizedName
  }) ?? null
}

function syncPickerSearchQuery(root: HTMLElement, query: string) {
  const searchInput = findPickerSearchInput(root)
  searchInput.readOnly = true
  searchInput.tabIndex = -1

  if (searchInput.value === query) {
    return
  }

  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  if (!valueDescriptor?.set) {
    throw new Error('Unable to update emoji picker search input')
  }

  valueDescriptor.set.call(searchInput, query)
  searchInput.dispatchEvent(new Event('input', { bubbles: true }))
}

function resolveTiptapEmojiItem(emojiData: EmojiClickData) {
  const pickerNames = new Set(emojiData.names.map(normalizeEmojiName))
  const pickerUnifiedCandidates = new Set([
    emojiData.unified.toLowerCase(),
    emojiData.unifiedWithoutSkinTone.toLowerCase(),
    ...getEmojiUnifiedCandidates(emojiData.emoji),
  ])

  const exactEmojiMatch = gitHubEmojis.find((item) => {
    if (!item.emoji) {
      return false
    }

    return Array.from(getEmojiUnifiedCandidates(item.emoji)).some(unified => pickerUnifiedCandidates.has(unified))
  })

  if (exactEmojiMatch) {
    return exactEmojiMatch
  }

  const exactNameMatch = gitHubEmojis.find(item => pickerNames.has(normalizeEmojiName(item.name)))
  if (exactNameMatch) {
    return exactNameMatch
  }

  const exactShortcodeMatch = gitHubEmojis.find((item) => {
    return item.shortcodes.some(shortcode => pickerNames.has(normalizeEmojiName(shortcode)))
  })

  if (!exactShortcodeMatch) {
    throw new Error(`No matching TipTap emoji found for ${emojiData.emoji}`)
  }

  return exactShortcodeMatch
}
export function EmojiList({ ref, items, command, query }: EmojiListProps) {
  const pickerRef = useRef<HTMLDivElement | null>(null)
  const [selectionState, setSelectionState] = useState(() => ({
    index: 0,
    query,
  }))
  const effectiveSelectedIndex = items.length === 0
    ? 0
    : Math.min(selectionState.query === query ? selectionState.index : 0, items.length - 1)
  const selectedItem = items[effectiveSelectedIndex]

  useLayoutEffect(() => {
    const root = pickerRef.current
    if (!root) {
      return
    }

    syncPickerSearchQuery(root, query)
  }, [query])

  useLayoutEffect(() => {
    const root = pickerRef.current
    if (!root) {
      return
    }

    for (const button of root.querySelectorAll<HTMLElement>('[data-memorilo-selected="true"]')) {
      button.removeAttribute('data-memorilo-selected')
    }

    if (!selectedItem) {
      return
    }

    const targetButton = findEmojiButton(root, selectedItem)
    if (!targetButton) {
      return
    }

    targetButton.setAttribute('data-memorilo-selected', 'true')
    targetButton.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [query, selectedItem])

  const selectItem = useCallback((index: number) => {
    const item = items[index]
    if (!item) {
      return
    }

    command(item)
  }, [command, items])

  const moveSelection = useCallback((direction: -1 | 1) => {
    setSelectionState((prev) => {
      const currentIndex = prev.query === query ? Math.min(prev.index, items.length - 1) : 0
      return {
        query,
        index: (currentIndex + items.length + direction) % items.length,
      }
    })
  }, [items.length, query])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) {
        return false
      }

      if (event.key === 'ArrowUp' || event.key === 'Up') {
        event.preventDefault()
        event.stopPropagation()
        moveSelection(-1)
        return true
      }

      if (event.key === 'ArrowDown' || event.key === 'Down') {
        event.preventDefault()
        event.stopPropagation()
        moveSelection(1)
        return true
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        selectItem(effectiveSelectedIndex)
        return true
      }

      return false
    },
  }), [effectiveSelectedIndex, items.length, moveSelection, selectItem])

  return (
    <div
      ref={pickerRef}
      onMouseDownCapture={(event) => {
        const target = event.target as Element | null
        if (target?.closest('button, input')) {
          event.preventDefault()
        }
      }}
      className="emoji-suggestion-shell rounded-md border bg-popover text-popover-foreground shadow-md"
    >
      <EmojiPicker
        theme={resolveEmojiTheme(pickerRef.current)}
        emojiStyle={EmojiStyle.NATIVE}
        autoFocusSearch={false}
        lazyLoadEmojis
        skinTonesDisabled
        previewConfig={{ showPreview: false }}
        searchPlaceholder="Search emoji"
        width={336}
        height={384}
        onEmojiClick={(emojiData) => {
          command(resolveTiptapEmojiItem(emojiData))
        }}
      />
    </div>
  )
}

EmojiList.displayName = 'EmojiList'
