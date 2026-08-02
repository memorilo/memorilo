import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DesktopConfigurationEnvironment } from '../configuration'
import { createRendererConfigurationStore } from '../configuration-store'
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
    expect(rendered.getByRole('heading', { name: 'MCP' })).toBeInTheDocument()
    expect(rendered.getByRole('switch', { name: 'Enable MCP server' })).toHaveAttribute('aria-checked', 'false')
    expect(rendered.getByRole('spinbutton', { name: 'MCP port' })).toHaveValue(8765)
    expect(rendered.getByLabelText('MCP access token')).toHaveAttribute('type', 'password')
    const language = rendered.getByRole('combobox', { name: 'Language' })
    expect(language).toHaveValue('system')
    expect(rendered.getAllByRole('option').map(option => option.textContent)).toEqual([
      'System Default',
      'English',
      '简体中文',
      'Logical',
      'Traditional',
    ])
    const reduceMotion = rendered.getByRole('switch', { name: 'Reduce motion' })
    expect(reduceMotion).toHaveAttribute('aria-checked', 'false')

    fireEvent.change(language, { target: { value: 'zh-CN' } })
    await waitFor(() => {
      expect(store.getSnapshot()).toEqual({
        language: 'zh-CN',
        mcp: { accessToken: '', enabled: false, port: 8765 },
        outdentBehavior: 'logical',
        reduceMotion: false,
      })
      expect(document.documentElement.lang).toBe('zh-CN')
    })

    fireEvent.click(reduceMotion)
    await waitFor(() => {
      expect(store.getSnapshot()).toEqual({
        language: 'zh-CN',
        mcp: { accessToken: '', enabled: false, port: 8765 },
        outdentBehavior: 'logical',
        reduceMotion: true,
      })
      expect(document.documentElement).toHaveAttribute('data-reduce-motion', 'true')
    })

    const accessToken = rendered.getByLabelText('MCP access token')
    const token = '0123456789abcdef0123456789abcdef'
    fireEvent.change(accessToken, { target: { value: token } })
    fireEvent.blur(accessToken)
    await waitFor(() => expect(store.getSnapshot().mcp.accessToken).toBe(token))

    fireEvent.click(rendered.getByRole('switch', { name: 'Enable MCP server' }))
    await waitFor(() => expect(store.getSnapshot().mcp.enabled).toBe(true))
    expect(rendered.getByRole('switch', { name: 'Enable MCP server' })).toHaveAttribute('aria-checked', 'true')

    store.close()
  })
})
