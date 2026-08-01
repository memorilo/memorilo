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
    const language = rendered.getByRole('combobox', { name: 'Language' })
    expect(language).toHaveValue('system')
    expect(rendered.getAllByRole('option').map(option => option.textContent)).toEqual([
      'System Default',
      'English',
      '简体中文',
    ])
    const reduceMotion = rendered.getByRole('switch', { name: 'Reduce motion' })
    expect(reduceMotion).toHaveAttribute('aria-checked', 'false')

    fireEvent.change(language, { target: { value: 'zh-CN' } })
    await waitFor(() => {
      expect(store.getSnapshot()).toEqual({ language: 'zh-CN', outdentBehavior: 'logical', reduceMotion: false })
      expect(document.documentElement.lang).toBe('zh-CN')
    })

    fireEvent.click(reduceMotion)
    await waitFor(() => {
      expect(store.getSnapshot()).toEqual({ language: 'zh-CN', outdentBehavior: 'logical', reduceMotion: true })
      expect(document.documentElement).toHaveAttribute('data-reduce-motion', 'true')
    })

    store.close()
  })
})
