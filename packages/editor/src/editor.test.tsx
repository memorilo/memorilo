import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { demoEditorAdapters } from './adapters/demo-adapters'
import { Editor } from './editor'

describe('editor', () => {
  it('renders a writable document with full editing controls', () => {
    const { container } = render(<Editor adapters={demoEditorAdapters} />)

    expect(container.querySelector('[contenteditable="true"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Bold' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /insert image/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /insert table/i })).toBeEnabled()
  })
})
