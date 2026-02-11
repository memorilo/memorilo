import type { EffectSystemCommands } from '@memorilo/api-spec/command'
import { wrapCommand } from './shared'

export const effectSystemCommands: EffectSystemCommands = {
  getClientId: wrapCommand('getClientId'),
  getAppLocalDataDir: wrapCommand('getAppLocalDataDir'),
  getGitCommitId: wrapCommand('getGitCommitId'),
  getDocNodesCount: wrapCommand('getDocNodesCount'),
  getDocUpdatesCount: wrapCommand('getDocUpdatesCount'),
}
