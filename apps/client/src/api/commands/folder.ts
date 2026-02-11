import type { EffectFolderCommands } from '@memorilo/api-spec/command'
import { wrapCommand } from './shared'

export const effectFolderCommands: EffectFolderCommands = {
  getRootFolderUuid: wrapCommand('getRootFolderUuid'),
  isFolderNodeExist: wrapCommand('isFolderNodeExist'),
  getFolderNode: wrapCommand('getFolderNode'),
  getFolderNodeChildren: wrapCommand('getFolderNodeChildren'),
  createFolderNode: wrapCommand('createFolderNode'),
  renameFolderNode: wrapCommand('renameFolderNode'),
  deleteFolderNodeRetParent: wrapCommand('deleteFolderNodeRetParent'),
  getParentFolderNodeUuid: wrapCommand('getParentFolderNodeUuid'),
}
