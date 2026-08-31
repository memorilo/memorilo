import inject from '@stylexjs/stylex/lib/stylex-inject'

/**
 * StyleX's runtime injector accepts one CSS rule per call. Global renderer
 * styles contain grouped selectors and media blocks, so split only at the
 * top-level closing brace before injecting each complete rule.
 */
export function injectGlobalStyle(cssText: string, priority = 0): void {
  const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//gu, '')
  let ruleStart = 0
  let depth = 0
  let quote: '\"' | '\'' | null = null
  let escaped = false

  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index]
    if (quote !== null) {
      if (escaped) {
        escaped = false
      }
      else if (character === '\\') {
        escaped = true
      }
      else if (character === quote) {
        quote = null
      }
      continue
    }
    if (character === '\"' || character === '\'') {
      quote = character
      continue
    }
    if (character === '{') {
      depth += 1
      continue
    }
    if (character !== '}')
      continue
    depth -= 1
    if (depth !== 0)
      continue
    const rule = withoutComments.slice(ruleStart, index + 1).trim()
    if (rule.length > 0)
      inject({ ltr: rule, priority })
    ruleStart = index + 1
  }

  const trailing = withoutComments.slice(ruleStart).trim()
  if (trailing.length > 0)
    inject({ ltr: trailing, priority })
}
