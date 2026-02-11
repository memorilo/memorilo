import type { FolderHandlers } from '@memorilo/api-spec/services/folder'
import { wrapCommand } from './shared'

export const folderHandlers: FolderHandlers = {
  getRootFolderUuid: wrapCommand('getRootFolderUuid'),
  isFolderNodeExist: wrapCommand('isFolderNodeExist'),
  getFolderNode: wrapCommand('getFolderNode'),
  getFolderNodeChildren: wrapCommand('getFolderNodeChildren'),
  createFolderNode: wrapCommand('createFolderNode'),
  renameFolderNode: wrapCommand('renameFolderNode'),
  deleteFolderNodeRetParent: wrapCommand('deleteFolderNodeRetParent'),
  getParentFolderNodeUuid: wrapCommand('getParentFolderNodeUuid'),
}
