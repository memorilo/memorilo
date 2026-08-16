import type { DesktopAssetCheckResult } from '@memorilo/desktop-api'
import type { DesktopApi } from '@memorilo/desktop-preload'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssetSettings } from './asset-settings'

const requests = vi.hoisted(() => ({
  checkAssets: vi.fn(),
  reclaimAssets: vi.fn(),
}))

vi.mock('../shared/desktop-requests', () => ({ desktopRequests: requests }))

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
  vi.clearAllMocks()
})

describe('asset settings', () => {
  it('clears stale reclaim candidates when a new asset check fails', async () => {
    requests.checkAssets
      .mockResolvedValueOnce(checkedAssets)
      .mockRejectedValueOnce(new Error('Asset check failed'))
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {} as DesktopApi,
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
    requests.checkAssets
      .mockResolvedValueOnce(checkedAssets)
      .mockResolvedValueOnce(afterRecovery)
    requests.reclaimAssets.mockRejectedValue(new Error('Failed to complete asset deletion'))
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {} as DesktopApi,
    })
    const rendered = render(<AssetSettings />)

    fireEvent.click(rendered.getByRole('button', { name: 'Check Assets' }))
    fireEvent.click(await rendered.findByRole('button', { name: 'Move to Trash' }))
    await waitFor(() => {
      expect(rendered.getByRole('status')).toHaveTextContent('Failed to complete asset deletion')
      expect(requests.checkAssets).toHaveBeenCalledTimes(2)
    })

    expect(rendered.queryByRole('button', { name: 'Move to Trash' })).not.toBeInTheDocument()
    expect(rendered.queryByText('photo.png')).not.toBeInTheDocument()
  })
})
