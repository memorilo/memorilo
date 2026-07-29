import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import { act, render, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { userEvent } from '../../test/browser/user-event'
import { createEditorLoroDocument, Editor } from '../index'

const adapters: EditorAdapters = {
  uploadImage: async () => 'memory://image',
  tagStorage: {
    search: async () => [],
    create: async tag => tag,
    update: async tag => tag,
  },
}

function documentWithText(id: string, text: string): NodeJSON {
  return {
    type: 'doc',
    content: [{
      type: 'list',
      attrs: { blockId: id, checked: false, collapsed: false, kind: 'outline', order: null },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    }],
  }
}

describe('loro editor documents', () => {
  it('exports an in-memory snapshot of an initialized editor', async () => {
    const loro = createEditorLoroDocument()
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={documentWithText('initial', 'Initial document')}
        loro={{ document: loro }}
        mode="document"
      />,
    )

    await within(rendered.container).findByText('Initial document')
    await waitFor(() => expect(loro.exportSnapshot().byteLength).toBeGreaterThan(0))
  })

  it('restores an editor from an in-memory snapshot', async () => {
    const original = createEditorLoroDocument()
    const first = render(
      <Editor
        adapters={adapters}
        initialContent={documentWithText('saved-node', 'Saved entirely in memory')}
        loro={{ document: original }}
        mode="document"
      />,
    )
    await within(first.container).findByText('Saved entirely in memory')
    const snapshot = original.exportSnapshot()
    first.unmount()

    const restored = createEditorLoroDocument({ snapshot })
    const second = render(
      <Editor adapters={adapters} loro={{ document: restored }} mode="document" />,
    )

    const block = await waitFor(() => {
      const element = second.container.querySelector('[data-block-id="saved-node"]')
      expect(element).toHaveTextContent('Saved entirely in memory')
      return element
    })
    expect(block).toHaveAttribute('data-list-kind', 'outline')
  })

  it('synchronizes incremental updates between in-memory editors', async () => {
    const source = createEditorLoroDocument()
    const initialized = render(
      <Editor
        adapters={adapters}
        initialContent={documentWithText('shared-node', 'Shared text')}
        loro={{ document: source }}
        mode="document"
      />,
    )
    await within(initialized.container).findByText('Shared text')
    const snapshot = source.exportSnapshot()
    initialized.unmount()

    const senderDocument = createEditorLoroDocument({ snapshot })
    const receiverDocument = createEditorLoroDocument({ snapshot })
    const sender = render(<Editor adapters={adapters} loro={{ document: senderDocument }} mode="document" />)
    const receiver = render(<Editor adapters={adapters} loro={{ document: receiverDocument }} mode="document" />)
    await within(sender.container).findByText('Shared text')
    await within(receiver.container).findByText('Shared text')
    const receiverVersion = receiverDocument.getVersion()
    expect(receiverVersion).toHaveLength(1)
    expect(receiverVersion[0]?.counter).toBeGreaterThan(0)

    await userEvent.click(within(sender.container).getByRole('textbox', { name: 'Editor content' }))
    await userEvent.keyboard('{End} synchronized')
    await waitFor(() => expect(sender.container.querySelector('[data-block-id="shared-node"]')).toHaveTextContent('Shared text synchronized'))

    const updates = senderDocument.exportUpdates(receiverVersion)
    await act(async () => {
      receiverDocument.importUpdates(updates)
      await new Promise<void>(resolve => queueMicrotask(resolve))
    })

    await waitFor(() => expect(receiver.container.querySelector('[data-block-id="shared-node"]')).toHaveTextContent('Shared text synchronized'))
  })

  it('converges after two peers edit independently and exchange updates', async () => {
    const source = createEditorLoroDocument()
    const initialized = render(
      <Editor
        adapters={adapters}
        initialContent={documentWithText('collaborative-node', 'Common')}
        loro={{ document: source }}
        mode="document"
      />,
    )
    await within(initialized.container).findByText('Common')
    const snapshot = source.exportSnapshot()
    initialized.unmount()

    const leftDocument = createEditorLoroDocument({ snapshot })
    const rightDocument = createEditorLoroDocument({ snapshot })
    const left = render(<Editor adapters={adapters} loro={{ document: leftDocument }} mode="document" />)
    const right = render(<Editor adapters={adapters} loro={{ document: rightDocument }} mode="document" />)
    await within(left.container).findByText('Common')
    await within(right.container).findByText('Common')
    const sharedVersion = leftDocument.getVersion()

    await userEvent.click(within(left.container).getByRole('textbox', { name: 'Editor content' }))
    await userEvent.keyboard('{End} from-left')
    await waitFor(() => expect(left.container.querySelector('[data-block-id="collaborative-node"]')).toHaveTextContent('Common from-left'))

    await userEvent.click(within(right.container).getByRole('textbox', { name: 'Editor content' }))
    await userEvent.keyboard('{Home}from-right ')
    await waitFor(() => expect(right.container.querySelector('[data-block-id="collaborative-node"]')).toHaveTextContent('from-right Common'))

    const leftUpdates = leftDocument.exportUpdates(sharedVersion)
    const rightUpdates = rightDocument.exportUpdates(sharedVersion)
    await act(async () => {
      leftDocument.importUpdates(rightUpdates)
      rightDocument.importUpdates(leftUpdates)
      await new Promise<void>(resolve => queueMicrotask(resolve))
    })

    await waitFor(() => {
      const leftText = left.container.querySelector('[data-block-id="collaborative-node"]')?.textContent
      const rightText = right.container.querySelector('[data-block-id="collaborative-node"]')?.textContent
      expect(leftText).toBe(rightText)
      expect(leftText).toContain('from-left')
      expect(leftText).toContain('from-right')
      expect(leftText).toContain('Common')
    })
  })

  it('travels to an earlier version and returns to the editable latest version', async () => {
    const loro = createEditorLoroDocument()
    const rendered = render(
      <Editor
        adapters={adapters}
        initialContent={documentWithText('timeline-node', 'Before')}
        loro={{ document: loro }}
        mode="document"
      />,
    )
    await within(rendered.container).findByText('Before')
    const earlierVersion = loro.getVersion()

    const editor = within(rendered.container).getByRole('textbox', { name: 'Editor content' })
    await userEvent.click(editor)
    await userEvent.keyboard('{End} after')
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="timeline-node"]')).toHaveTextContent('Before after'))
    const latestVersion = loro.getVersion()
    expect(latestVersion).not.toEqual(earlierVersion)

    await act(async () => {
      loro.checkout(earlierVersion)
      await new Promise<void>(resolve => queueMicrotask(resolve))
    })
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="timeline-node"]')).toHaveTextContent('Before'))
    expect(loro.isTimeTraveling()).toBe(true)

    await act(async () => {
      loro.checkoutLatest()
      await new Promise<void>(resolve => queueMicrotask(resolve))
    })
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="timeline-node"]')).toHaveTextContent('Before after'))
    expect(loro.isTimeTraveling()).toBe(false)

    await userEvent.click(editor)
    await userEvent.keyboard('{End} again')
    await waitFor(() => expect(rendered.container.querySelector('[data-block-id="timeline-node"]')).toHaveTextContent('Before after again'))
  })
})
