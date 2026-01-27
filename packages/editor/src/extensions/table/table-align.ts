export function createTextAlignAttribute() {
  const alignValues = new Set(['left', 'center', 'right'])
  const classPrefix = 'tableAlign'

  const resolveTextAlign = (value?: string | null) => (
    value && alignValues.has(value) ? value : null
  )

  const parseClassAlign = (element: HTMLElement) => {
    const classMatch = Array.from(element.classList)
      .find(className => className.startsWith(classPrefix))
    if (!classMatch) {
      return null
    }
    const raw = classMatch.slice(classPrefix.length)
    return resolveTextAlign(raw.toLowerCase())
  }

  const toClassName = (textAlign: string) => (
    `${classPrefix}${textAlign.charAt(0).toUpperCase()}${textAlign.slice(1)}`
  )

  const toAttributes = (textAlign?: string | null) => {
    const resolved = resolveTextAlign(textAlign)
    return resolved ? { class: toClassName(resolved) } : {}
  }

  return {
    textAlign: {
      default: null,
      parseHTML: (element: HTMLElement) => parseClassAlign(element),
      // Preserve text alignment in node attributes so table commands can update it reliably.
      renderHTML: (attributes: { textAlign?: string | null }) => toAttributes(attributes.textAlign),
    },
  }
}
