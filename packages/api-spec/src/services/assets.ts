import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export interface Asset {
  assetId: string
  filename: string
  sha256: string
  clientId: string
  createdAt: string
  meta: string | null
}

export interface AssetAnalysisEntry {
  assetId: string
  filename: string
}

export interface AssetAnalysisResult {
  missingFiles: AssetAnalysisEntry[]
  untrackedFiles: AssetAnalysisEntry[]
  unusedFiles: AssetAnalysisEntry[]
}

export interface AssetDeleteResult {
  deletedRecord: boolean
  deletedFiles: string[]
}

export interface EffectAssetsCommands {
  addAsset: (sourcePath: string, meta: string | null) => Effect.Effect<Asset, CommandError<ApiError>>
  addAssetFromBytes: (bytes: number[], extension: string | null, meta: string | null) => Effect.Effect<Asset, CommandError<ApiError>>
  addAssetFromBase64: (base64: string, extension: string | null, meta: string | null) => Effect.Effect<Asset, CommandError<ApiError>>
  addAssetFromUrl: (url: string) => Effect.Effect<Asset, CommandError<ApiError>>
  deleteAsset: (assetId: string) => Effect.Effect<AssetDeleteResult, CommandError<ApiError>>
  analyzeAssets: () => Effect.Effect<AssetAnalysisResult, CommandError<ApiError>>
  getAssetUrl: (assetId: string, useHttps: boolean | null) => Effect.Effect<string, CommandError<ApiError>>
}

export class AssetsService extends Effect.Tag('AssetsService')<AssetsService, EffectAssetsCommands>() {}
