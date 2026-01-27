import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji'
import { emojiSuggestion } from './suggestion'

export { gitHubEmojis } from '@tiptap/extension-emoji'

export const EmojiExtension = Emoji.configure({
  emojis: gitHubEmojis,
  suggestion: emojiSuggestion,
})
