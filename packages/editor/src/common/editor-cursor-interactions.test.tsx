import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EditorTestHarness as Editor } from '../../test/browser/editor-test-harness'
import { userEvent } from '../../test/browser/user-event'
import { adapters, documentBlock, paragraph } from '../document/document-interactions.fixture'
import { advanceCriticallyDampedCursorAxis } from './cursor-motion'
import { EditorMode } from './editor-mode'

function setCursorVfx(mode: string, density: number): void {
  document.documentElement.dataset.editorCursorAnimationLength = '0'
  document.documentElement.dataset.editorCursorShortAnimationLength = '0'
  document.documentElement.dataset.editorCursorVfxMode = mode
  document.documentElement.dataset.editorCursorVfxParticleDensity = String(density)
  document.documentElement.dataset.editorCursorVfxParticleLifetime = '5'
}

async function moveCursorToNextBlock(rendered: ReturnType<typeof render>): Promise<void> {
  await userEvent.click(rendered.getByText('First line'))
  await userEvent.keyboard('{End}{ArrowDown}')
}

describe('editor cursor effects', () => {
  afterEach(() => {
    delete document.documentElement.dataset.editorCursorAnimationLength
    delete document.documentElement.dataset.editorCursorShortAnimationLength
    delete document.documentElement.dataset.editorCursorVfxMode
    delete document.documentElement.dataset.editorCursorVfxParticleDensity
    delete document.documentElement.dataset.editorCursorVfxParticleLifetime
  })

  it('matches Neovide critically damped cursor timing', () => {
    const axis = { position: 0, velocity: 0 }

    expect(advanceCriticallyDampedCursorAxis(axis, 10, 0.016, 0.04)).toBe(true)
    expect(axis.position).toBeCloseTo(4.751, 3)

    expect(advanceCriticallyDampedCursorAxis(axis, 10, 0.024, 0.04)).toBe(true)
    expect(axis.position).toBeCloseTo(9.084, 3)
  })

  it('renders wireframe particles as outlined squares', async () => {
    setCursorVfx('wireframe', 1)
    const rendered = render(
      <Editor
        adapters={adapters}
        mode={EditorMode.Document}
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('first', paragraph('First line')),
            documentBlock('second', paragraph('Second line')),
          ],
        }}
      />,
    )
    await rendered.findByText('First line')
    await moveCursorToNextBlock(rendered)

    await waitFor(() => {
      const particles = rendered.container.querySelectorAll<HTMLElement>('[data-editor-cursor-particle="wireframe"]')
      const particle = particles.item(particles.length - 1)
      expect(particle).not.toBeNull()
      expect(particle?.className).toContain('cursorParticleWireframe')
      const trail = rendered.container.querySelector<HTMLElement>('[aria-hidden="true"] > div')
      expect(trail?.style.width).toBe('')
      const cursor = rendered.container.querySelector<HTMLElement>('[aria-hidden="true"] > div:nth-of-type(2)')
      const particleBounds = particle?.getBoundingClientRect()
      const cursorBounds = cursor?.getBoundingClientRect()
      expect(particleBounds).toBeDefined()
      expect(cursorBounds).toBeDefined()
      expect((particleBounds?.left ?? 0) + (particleBounds?.width ?? 0) / 2)
        .toBeCloseTo((cursorBounds?.left ?? 0) + (cursorBounds?.width ?? 0) / 2, 0)
      expect((particleBounds?.top ?? 0) + (particleBounds?.height ?? 0) / 2)
        .toBeCloseTo((cursorBounds?.top ?? 0) + (cursorBounds?.height ?? 0) / 2, 0)
    }, { timeout: 1000 })
  })

  it('does not create particles when density is zero', async () => {
    setCursorVfx('railgun', 0)
    const rendered = render(
      <Editor
        adapters={adapters}
        mode={EditorMode.Document}
        initialContent={{
          type: 'doc',
          content: [
            documentBlock('first', paragraph('First line')),
            documentBlock('second', paragraph('Second line')),
          ],
        }}
      />,
    )
    await rendered.findByText('First line')
    await moveCursorToNextBlock(rendered)

    await waitFor(() => {
      expect(rendered.container.querySelectorAll('[data-editor-cursor-particle]')).toHaveLength(0)
    })
  })
})
