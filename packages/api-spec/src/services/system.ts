import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export interface SystemHandlers {
  getClientId: () => Effect.Effect<string, CommandError<ApiError | Error>>
  getAppLocalDataDir: () => Effect.Effect<string, CommandError<ApiError | Error>>
  getGitCommitId: () => Effect.Effect<string, CommandError<ApiError | Error>>
  getDocNodesCount: () => Effect.Effect<string, CommandError<ApiError | Error>>
  getDocUpdatesCount: () => Effect.Effect<string, CommandError<ApiError | Error>>
}

export class SystemService extends Effect.Tag('SystemService')<SystemService, SystemHandlers>() {}
