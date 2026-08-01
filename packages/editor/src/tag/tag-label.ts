const MAX_TAG_LABEL_LENGTH = 64
const TAG_LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u

export type TagLabelError = 'empty' | 'too-long' | 'invalid-format'

export const TAG_LABEL_ERROR_TRANSLATION_KEYS: Record<TagLabelError, string> = {
  'empty': 'ui.enterTagName',
  'too-long': 'ui.tagNameTooLong',
  'invalid-format': 'ui.invalidTagLabel',
}

export function normalizeTagLabel(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
}

export function getTagLabelError(value: string): TagLabelError | null {
  const label = normalizeTagLabel(value)
  if (!label)
    return 'empty'
  if (label.length > MAX_TAG_LABEL_LENGTH)
    return 'too-long'
  if (!TAG_LABEL_PATTERN.test(label))
    return 'invalid-format'
  return null
}

export function isSameTagLabel(left: string, right: string) {
  return normalizeTagLabel(left).toLocaleLowerCase() === normalizeTagLabel(right).toLocaleLowerCase()
}
