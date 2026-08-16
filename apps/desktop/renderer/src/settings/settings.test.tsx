import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DesktopConfigurationEnvironment } from '../app/configuration/configuration-environment'
import { createRendererConfigurationStore } from '../app/configuration/configuration-store'
import { Settings } from './settings'

describe('settings renderer', () => {
  it('renders the configuration prototype and updates it without Electron', async () => {
    expect(window.desktop).toBeUndefined()

    const store = await createRendererConfigurationStore()
    const rendered = render(
      <DesktopConfigurationEnvironment store={store}>
        <Settings store={store} />
      </DesktopConfigurationEnvironment>,
    )

    expect(rendered.getByRole('heading', { name: 'General' })).toBeInTheDocument()
    const language = rendered.getByRole('combobox', { name: 'Language' })
    expect(language).toHaveValue('system')
    expect(rendered.getAllByRole('option').map(option => option.textContent)).toEqual([
      'System Default',
      'English',
      '简体中文',
    ])
    expect(rendered.getByRole('switch', { name: 'Reduce motion' })).toHaveAttribute('aria-checked', 'false')
    expect(rendered.getByRole('radio', { name: 'Sunday' })).toBeChecked()
    fireEvent.click(rendered.getByRole('radio', { name: 'Monday' }))
    await waitFor(() => expect(store.getSnapshot().weekStart).toBe('monday'))

    fireEvent.click(rendered.getByRole('button', { name: 'Notes & Editor' }))
    expect(await rendered.findByRole('heading', { name: 'Notes & Editor' })).toBeInTheDocument()
    expect(rendered.getByRole('combobox', { name: 'Pasted network images' })).toHaveValue('download')

    fireEvent.click(rendered.getByRole('button', { name: 'Media & Storage' }))
    expect(await rendered.findByRole('heading', { name: 'Media & Storage' })).toBeInTheDocument()
    expect(rendered.getByRole('combobox', { name: 'TIFF conversion format' })).toHaveValue('webp')

    fireEvent.click(rendered.getByRole('button', { name: 'Reading' }))
    expect(await rendered.findByRole('heading', { name: 'Reading' })).toBeInTheDocument()
    expect(rendered.getByRole('radio', { name: 'Continuous' })).toBeChecked()
    fireEvent.click(rendered.getByRole('radio', { name: 'Single page' }))
    await waitFor(() => expect(store.getSnapshot().readerPageMode).toBe('single-page'))
    const copyFormat = rendered.getByRole('combobox', { name: 'Highlight copy format' })
    expect(copyFormat).toHaveValue('text')
    fireEvent.change(copyFormat, { target: { value: 'text-book-location' } })
    await waitFor(() => expect(store.getSnapshot().readerAnnotationCopyFormat).toBe('text-book-location'))

    fireEvent.click(rendered.getByRole('button', { name: 'MCP' }))
    expect(await rendered.findByRole('heading', { name: 'MCP' })).toBeInTheDocument()
    expect(rendered.getByRole('switch', { name: 'Enable MCP server' })).toHaveAttribute('aria-checked', 'false')
    expect(rendered.getByRole('spinbutton', { name: 'MCP port' })).toHaveValue(8765)
    const accessToken = rendered.getByLabelText('MCP access token')
    expect(accessToken).toHaveAttribute('type', 'password')
    const token = '0123456789abcdef0123456789abcdef'
    fireEvent.change(accessToken, { target: { value: token } })
    fireEvent.blur(accessToken)
    await waitFor(() => expect(store.getSnapshot().mcp.accessToken).toBe(token))

    fireEvent.click(rendered.getByRole('switch', { name: 'Enable MCP server' }))
    await waitFor(() => expect(store.getSnapshot().mcp.enabled).toBe(true))
    expect(rendered.getByRole('switch', { name: 'Enable MCP server' })).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(rendered.getByRole('button', { name: 'General' }))
    await rendered.findByRole('heading', { name: 'General' })
    const localizedLanguage = rendered.getByRole('combobox', { name: 'Language' })
    fireEvent.change(localizedLanguage, { target: { value: 'zh-CN' } })
    await waitFor(() => {
      expect(store.getSnapshot()).toEqual({
        anki: desktopConfigurationDefinition.defaults.anki,
        backup: desktopConfigurationDefinition.defaults.backup,
        defaultNoteLearningEnabled: true,
        flashcards: desktopConfigurationDefinition.defaults.flashcards,
        goals: desktopConfigurationDefinition.defaults.goals,
        learning: desktopConfigurationDefinition.defaults.learning,
        language: 'zh-CN',
        mcp: { accessToken: token, enabled: true, port: 8765 },
        networkImagePasteBehavior: 'download',
        outdentBehavior: 'logical',
        readerArrowKeyPageTurning: true,
        readerAnnotationCopyFormat: 'text-book-location',
        readerEpubPresentationMode: 'publisher',
        readerPageMode: 'single-page',
        reduceMotion: false,
        tiffConversionFormat: 'webp',
        todo: desktopConfigurationDefinition.defaults.todo,
        weekStart: 'monday',
      })
      expect(document.documentElement.lang).toBe('zh-CN')
    })

    fireEvent.click(rendered.getByRole('switch', { name: 'Reduce motion' }))
    await waitFor(() => {
      expect(store.getSnapshot()).toEqual({
        anki: desktopConfigurationDefinition.defaults.anki,
        backup: desktopConfigurationDefinition.defaults.backup,
        defaultNoteLearningEnabled: true,
        flashcards: desktopConfigurationDefinition.defaults.flashcards,
        goals: desktopConfigurationDefinition.defaults.goals,
        learning: desktopConfigurationDefinition.defaults.learning,
        language: 'zh-CN',
        mcp: { accessToken: token, enabled: true, port: 8765 },
        networkImagePasteBehavior: 'download',
        outdentBehavior: 'logical',
        readerArrowKeyPageTurning: true,
        readerAnnotationCopyFormat: 'text-book-location',
        readerEpubPresentationMode: 'publisher',
        readerPageMode: 'single-page',
        reduceMotion: true,
        tiffConversionFormat: 'webp',
        todo: desktopConfigurationDefinition.defaults.todo,
        weekStart: 'monday',
      })
      expect(document.documentElement).toHaveAttribute('data-reduce-motion', 'true')
    })

    store.close()
  })
})
