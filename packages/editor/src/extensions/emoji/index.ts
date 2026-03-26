import type { EmojiItem } from '@tiptap/extension-emoji'
import type { SuggestionOptions } from '@tiptap/suggestion'
import TiptapEmoji, { gitHubEmojis } from '@tiptap/extension-emoji'
import { emojiSuggestion } from './suggestion'
import './emoji.css'

export { gitHubEmojis } from '@tiptap/extension-emoji'

const insertEmojiWithoutTrailingSpace: NonNullable<SuggestionOptions<EmojiItem>['command']> = ({
  editor,
  range,
  props,
}) => {
  editor
    .chain()
    .focus()
    .insertContentAt(range, {
      type: 'emoji',
      attrs: props,
    })
    .command(({ tr, state }) => {
      tr.setStoredMarks(state.doc.resolve(state.selection.to - 1).marks())
      return true
    })
    .run()
}

export const Emoji = TiptapEmoji.configure({
  emojis: gitHubEmojis,
  suggestion: {
    ...emojiSuggestion,
    command: insertEmojiWithoutTrailingSpace,
  },
})
