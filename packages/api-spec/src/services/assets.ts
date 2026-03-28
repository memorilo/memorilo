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

export interface AssetsHandlers {
  addAsset: (sourcePath: string, meta: string | null) => Effect.Effect<Asset, CommandError<ApiError | Error>>
  addAssetFromBytes: (bytes: number[], extension: string | null, meta: string | null) => Effect.Effect<Asset, CommandError<ApiError | Error>>
  addAssetFromBase64: (base64: string, extension: string | null, meta: string | null) => Effect.Effect<Asset, CommandError<ApiError | Error>>
  addAssetFromUrl: (url: string) => Effect.Effect<Asset, CommandError<ApiError | Error>>
  getAssetUrl: (assetId: string, useHttps: boolean | null) => Effect.Effect<string, CommandError<ApiError | Error>>

  deleteAsset: (assetId: string) => Effect.Effect<AssetDeleteResult, CommandError<ApiError | Error>>
  analyzeAssets: () => Effect.Effect<AssetAnalysisResult, CommandError<ApiError | Error>>
}

export class AssetsService extends Effect.Tag('AssetsService')<AssetsService, AssetsHandlers>() {}
