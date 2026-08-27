import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ShortcutInput } from './shortcut-input'

vi.mock('@stylexjs/stylex', () => ({
  create: (styles: unknown) => styles,
  props: () => ({}),
}))

describe('shortcut input', () => {
  it('renders each shortcut part as a keyboard key', () => {
    const markup = renderToStaticMarkup(
      <ShortcutInput label="Back" onChange={() => {}} value="Alt+Right" />,
    )

    expect(markup).toContain('<kbd')
    expect(markup).toContain('>Alt</kbd>')
    expect(markup).toContain('>→</kbd>')
    expect(markup).toContain('>+</span>')
  })

  it('renders the platform-neutral primary modifier as a command key', () => {
    const markup = renderToStaticMarkup(
      <ShortcutInput label="Bold" onChange={() => {}} value="Mod+B" />,
    )

    expect(markup).toContain('>⌘</kbd>')
    expect(markup).toContain('>B</kbd>')
  })

  it('shows the placeholder when the binding is cleared', () => {
    const markup = renderToStaticMarkup(
      <ShortcutInput label="Back" onChange={() => {}} placeholder="Not set" value="" />,
    )

    expect(markup).toContain('>Not set</span>')
    expect(markup).not.toContain('<kbd')
  })
})
