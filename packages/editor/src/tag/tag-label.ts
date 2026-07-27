const MAX_TAG_LABEL_LENGTH = 64
const TAG_LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u

export function normalizeTagLabel(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
}

export function getTagLabelError(value: string): string | null {
  const label = normalizeTagLabel(value)
  if (!label)
    return 'Enter a tag name'
  if (label.length > MAX_TAG_LABEL_LENGTH)
    return `Tag names must be ${MAX_TAG_LABEL_LENGTH} characters or fewer`
  if (!TAG_LABEL_PATTERN.test(label))
    return 'Use letters, numbers, underscores, or hyphens'
  return null
}

export function isSameTagLabel(left: string, right: string) {
  return normalizeTagLabel(left).toLocaleLowerCase() === normalizeTagLabel(right).toLocaleLowerCase()
}
