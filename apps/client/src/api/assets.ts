import type { AssetsHandlers } from '@memorilo/api-spec/services/assets'
import { wrapCommand } from './shared'

export const assetsHandlers: AssetsHandlers = {
  addAsset: wrapCommand('addAsset'),
  addAssetFromBytes: wrapCommand('addAssetFromBytes'),
  addAssetFromBase64: wrapCommand('addAssetFromBase64'),
  addAssetFromUrl: wrapCommand('addAssetFromUrl'),
  deleteAsset: wrapCommand('deleteAsset'),
  analyzeAssets: wrapCommand('analyzeAssets'),
  getAssetUrl: wrapCommand('getAssetUrl'),
}
