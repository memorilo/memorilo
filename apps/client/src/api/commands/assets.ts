import type { EffectAssetsCommands } from '@memorilo/api-spec/command'
import { wrapCommand } from './shared'

export const effectAssetsCommands: EffectAssetsCommands = {
  addAsset: wrapCommand('addAsset'),
  addAssetFromBytes: wrapCommand('addAssetFromBytes'),
  addAssetFromBase64: wrapCommand('addAssetFromBase64'),
  addAssetFromUrl: wrapCommand('addAssetFromUrl'),
  deleteAsset: wrapCommand('deleteAsset'),
  analyzeAssets: wrapCommand('analyzeAssets'),
  getAssetUrl: wrapCommand('getAssetUrl'),
}
