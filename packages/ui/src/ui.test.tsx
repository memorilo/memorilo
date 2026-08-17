import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  ButtonGroup,
  ContextMenu,
  Dialog,
  DropdownMenu,
  EditableTitle,
  SegmentedControl,
  Sidebar,
  Switch,
  Tabs,
  TextField,
  Toolbar,
} from './index'

describe('public UI composition', () => {
  it('composes buttons inside a labelled group without changing button behavior', async () => {
    const onClick = vi.fn()
    render(
      <ButtonGroup aria-label="Page navigation" variant="glass">
        <Button aria-label="Back" variant="titlebar" onClick={onClick}>Back</Button>
        <Button aria-label="Forward" disabled variant="titlebar">Forward</Button>
      </ButtonGroup>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByRole('group', { name: 'Page navigation' })).toContainElement(screen.getByRole('button', { name: 'Forward' }))
    expect(screen.getByRole('button', { name: 'Forward' })).toBeDisabled()
  })

  it('renders a button through asChild without nesting interactive elements', async () => {
    const onClick = vi.fn()
    render(
      <Button asChild variant="primary" onClick={onClick}>
        <a href="#learning">Back to Learning</a>
      </Button>,
    )

    const link = screen.getByRole('link', { name: 'Back to Learning' })
    expect(link).toHaveAttribute('data-ui', 'button')
    expect(link).toHaveAttribute('data-variant', 'primary')
    expect(link.closest('button')).toBeNull()
    await userEvent.click(link)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('keeps sidebar structure composable while exposing its active item state', () => {
    render(
      <Sidebar.Root aria-label="Workspace navigation" variant="workspace">
        <Sidebar.Header>Workspace</Sidebar.Header>
        <Sidebar.Navigation>
          <Sidebar.Item data-state="active">
            <Sidebar.ItemIcon>J</Sidebar.ItemIcon>
            <Sidebar.ItemLabel>Journals</Sidebar.ItemLabel>
          </Sidebar.Item>
        </Sidebar.Navigation>
      </Sidebar.Root>,
    )

    expect(screen.getByRole('complementary', { name: 'Workspace navigation' })).toHaveAttribute('data-variant', 'workspace')
    expect(screen.getByText('Journals').closest('[data-state="active"]')).not.toBeNull()
  })

  it('renders a sidebar root through asChild without adding a wrapper', () => {
    render(
      <Sidebar.Root asChild variant="workspace">
        <section aria-label="Workspace navigation">
          <Sidebar.Navigation>Navigation</Sidebar.Navigation>
        </section>
      </Sidebar.Root>,
    )

    const root = screen.getByRole('region', { name: 'Workspace navigation' })
    expect(root).toHaveAttribute('data-ui', 'sidebar')
    expect(root).toHaveAttribute('data-variant', 'workspace')
    expect(document.querySelector('aside')).toBeNull()
  })

  it('composes slot and child events while respecting preventDefault', async () => {
    const slotClick = vi.fn()
    const childClick = vi.fn()
    const cancelledSlotClick = vi.fn()
    render(
      <Sidebar.Root variant="workspace">
        <Sidebar.Item asChild onClick={slotClick}>
          <a href="#item" onClick={childClick}>Item</a>
        </Sidebar.Item>
        <Sidebar.Item asChild onClick={cancelledSlotClick}>
          <a
            href="#cancelled"
            onClick={(event) => {
              event.preventDefault()
            }}
          >
            Cancelled item
          </a>
        </Sidebar.Item>
      </Sidebar.Root>,
    )

    await userEvent.click(screen.getByRole('link', { name: 'Item' }))
    expect(childClick).toHaveBeenCalledOnce()
    expect(slotClick).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('link', { name: 'Cancelled item' }))
    expect(cancelledSlotClick).not.toHaveBeenCalled()
  })

  it('exposes controlled switch behavior through switch semantics', async () => {
    function Example() {
      const [checked, setChecked] = useState(false)
      return <Switch aria-label="Interval fuzz" checked={checked} onCheckedChange={setChecked} />
    }
    render(<Example />)

    const control = screen.getByRole('switch', { name: 'Interval fuzz' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(control)
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('provides text fields without owning feature labels or validation copy', async () => {
    render(<TextField aria-label="OPDS address" defaultValue="https://example.com/opds" />)
    const field = screen.getByRole('textbox', { name: 'OPDS address' })
    await userEvent.clear(field)
    await userEvent.type(field, 'https://library.example/opds')
    expect(field).toHaveValue('https://library.example/opds')
  })

  it('keeps segmented selection and tabs as separate state models', async () => {
    function Example() {
      const [direction, setDirection] = useState('forward')
      const [tab, setTab] = useState('notes')
      return (
        <>
          <SegmentedControl.Root aria-label="Card direction" value={direction} onValueChange={setDirection}>
            <SegmentedControl.Item value="forward">Forward</SegmentedControl.Item>
            <SegmentedControl.Item value="reverse">Reverse</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List aria-label="Learning views">
              <Tabs.Trigger value="notes">Notes</Tabs.Trigger>
              <Tabs.Trigger value="optimizer">Optimizer</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        </>
      )
    }
    render(<Example />)

    await userEvent.click(screen.getByRole('radio', { name: 'Reverse' }))
    expect(screen.getByRole('radio', { name: 'Reverse' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Optimizer' }))
    expect(screen.getByRole('tab', { name: 'Optimizer' })).toHaveAttribute('aria-selected', 'true')
  })

  it('supports roving focus and selection with arrow keys', async () => {
    render(
      <>
        <SegmentedControl.Root aria-label="Card direction" defaultValue="forward">
          <SegmentedControl.Item value="forward">Forward</SegmentedControl.Item>
          <SegmentedControl.Item value="reverse">Reverse</SegmentedControl.Item>
        </SegmentedControl.Root>
        <Tabs.Root defaultValue="notes">
          <Tabs.List aria-label="Learning views">
            <Tabs.Trigger value="notes">Notes</Tabs.Trigger>
            <Tabs.Trigger value="optimizer">Optimizer</Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </>,
    )

    const forward = screen.getByRole('radio', { name: 'Forward' })
    forward.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Reverse' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Reverse' })).toHaveAttribute('aria-checked', 'true')

    const notes = screen.getByRole('tab', { name: 'Notes' })
    notes.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Optimizer' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Optimizer' })).toHaveAttribute('aria-selected', 'true')
  })

  it('provides a toolbar surface without prescribing its actions', () => {
    render(
      <Toolbar.Root aria-label="Formatting" variant="floating">
        <Toolbar.Group aria-label="Text style">
          <Button aria-label="Bold" variant="toolbar">B</Button>
        </Toolbar.Group>
      </Toolbar.Root>,
    )
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toContainElement(screen.getByRole('group', { name: 'Text style' }))
  })

  it('opens a dropdown menu, moves focus, and closes after selection', async () => {
    const onSelect = vi.fn()
    render(
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>Options</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content aria-label="Options menu">
            <DropdownMenu.Item onSelect={onSelect}>First option</DropdownMenu.Item>
            <DropdownMenu.Item>Second option</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>,
    )

    const trigger = screen.getByRole('button', { name: 'Options' })
    await userEvent.click(trigger)
    expect(screen.getByRole('menu', { name: 'Options menu' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'First option' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Second option' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu', { name: 'Options menu' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('supports a controlled context menu with coordinates and Escape dismissal', async () => {
    render(
      <ContextMenu.Root defaultOpen defaultPosition={{ x: 24, y: 32 }}>
        <ContextMenu.Portal>
          <ContextMenu.Content aria-label="Editor actions">
            <ContextMenu.Item>Cut</ContextMenu.Item>
            <ContextMenu.Item>Copy</ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>,
    )

    const menu = screen.getByRole('menu', { name: 'Editor actions' })
    expect(menu).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cut' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Editor actions' })).not.toBeInTheDocument()
  })

  it('submits an editable title through its compound input', async () => {
    const onSubmit = vi.fn(async (value: string) => {
      expect(value).toBe('Renamed note')
    })
    render(
      <EditableTitle.Root value="Original note" onSubmit={onSubmit}>
        <EditableTitle.Trigger aria-label="Rename note">
          <EditableTitle.Text>Original note</EditableTitle.Text>
        </EditableTitle.Trigger>
        <EditableTitle.Input aria-label="Note title" />
        <EditableTitle.Error />
      </EditableTitle.Root>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Rename note' }))
    const input = screen.getByRole('textbox', { name: 'Note title' })
    expect(input).toHaveFocus()
    await userEvent.clear(input)
    await userEvent.type(input, 'Renamed note')
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('Renamed note')
    expect(screen.getByRole('button', { name: 'Rename note' })).toHaveTextContent('Original note')
  })

  it('composes dialog state, focus, and labelled surface parts', async () => {
    render(
      <Dialog.Root>
        <Dialog.Trigger>Open dialog</Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Header><Dialog.Title>Create folder</Dialog.Title></Dialog.Header>
            <Dialog.Body>
              <Dialog.Description>Choose a folder name.</Dialog.Description>
              <TextField aria-label="Folder name" />
            </Dialog.Body>
            <Dialog.Footer><Dialog.Close>Cancel</Dialog.Close></Dialog.Footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    )

    const trigger = screen.getByRole('button', { name: 'Open dialog' })
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Create folder' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Create folder' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('prioritizes an autofocus field over earlier dialog controls', async () => {
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Portal>
          <Dialog.Content aria-label="Create folder">
            <Dialog.Close aria-label="Close dialog">Close</Dialog.Close>
            <TextField aria-label="Folder name" autoFocus />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    )

    expect(screen.getByRole('textbox', { name: 'Folder name' })).toHaveFocus()
  })
})
