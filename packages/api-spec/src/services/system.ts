import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export interface EffectSystemCommands {
  getClientId: () => Effect.Effect<string, CommandError>
  getAppLocalDataDir: () => Effect.Effect<string, CommandError<ApiError>>
  getGitCommitId: () => Effect.Effect<string, CommandError>
  getDocNodesCount: () => Effect.Effect<string, CommandError<ApiError>>
  getDocUpdatesCount: () => Effect.Effect<string, CommandError<ApiError>>
}

export class SystemService extends Effect.Tag('SystemService')<SystemService, EffectSystemCommands>() {}
