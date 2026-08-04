import type { DesktopApi, DesktopAssetCheckResult } from '@memorilo/desktop-preload'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssetSettings } from './asset-settings'

const checkedAssets: DesktopAssetCheckResult = {
  candidates: [{
    byteSize: 128,
    fileName: '0f1e2d3c-4b5a-4678-9abc-0d1e2f3a4b5c.png',
    originalFileName: 'photo.png',
  }],
  managedAssetCount: 1,
  missingAssets: [],
  referencedAssetCount: 0,
}

afterEach(() => {
  Reflect.deleteProperty(window, 'desktop')
})

describe('asset settings', () => {
  it('clears stale reclaim candidates when a new asset check fails', async () => {
    const checkAssets = vi.fn()
      .mockResolvedValueOnce(checkedAssets)
      .mockRejectedValueOnce(new Error('Asset check failed'))
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: { checkAssets } as unknown as DesktopApi,
    })
    const rendered = render(<AssetSettings />)

    fireEvent.click(rendered.getByRole('button', { name: 'Check Assets' }))
    expect(await rendered.findByRole('button', { name: 'Move to Trash' })).toBeEnabled()

    fireEvent.click(rendered.getByRole('button', { name: 'Check Assets' }))
    await waitFor(() => {
      expect(rendered.getByRole('status')).toHaveTextContent('Asset check failed')
    })

    expect(rendered.queryByRole('button', { name: 'Move to Trash' })).not.toBeInTheDocument()
    expect(rendered.queryByText('photo.png')).not.toBeInTheDocument()
  })

  it('rescans after reclaim fails so a moved file and its database claim are reconciled', async () => {
    const afterRecovery: DesktopAssetCheckResult = {
      candidates: [],
      managedAssetCount: 0,
      missingAssets: [],
      referencedAssetCount: 0,
    }
    const checkAssets = vi.fn()
      .mockResolvedValueOnce(checkedAssets)
      .mockResolvedValueOnce(afterRecovery)
    const reclaimAssets = vi.fn().mockRejectedValue(new Error('Failed to complete asset deletion'))
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: { checkAssets, reclaimAssets } as unknown as DesktopApi,
    })
    const rendered = render(<AssetSettings />)

    fireEvent.click(rendered.getByRole('button', { name: 'Check Assets' }))
    fireEvent.click(await rendered.findByRole('button', { name: 'Move to Trash' }))
    await waitFor(() => {
      expect(rendered.getByRole('status')).toHaveTextContent('Failed to complete asset deletion')
      expect(checkAssets).toHaveBeenCalledTimes(2)
    })

    expect(rendered.queryByRole('button', { name: 'Move to Trash' })).not.toBeInTheDocument()
    expect(rendered.queryByText('photo.png')).not.toBeInTheDocument()
  })
})
