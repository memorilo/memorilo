import type { SystemHandlers } from '@memorilo/api-spec/services/system'
import { wrapCommand } from './shared'

export const systemHandlers: SystemHandlers = {
  getClientId: wrapCommand('getClientId'),
  getAppLocalDataDir: wrapCommand('getAppLocalDataDir'),
  getGitCommitId: wrapCommand('getGitCommitId'),
  getDocNodesCount: wrapCommand('getDocNodesCount'),
  getDocUpdatesCount: wrapCommand('getDocUpdatesCount'),
}
