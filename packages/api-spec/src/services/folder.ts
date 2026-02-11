import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export type FolderNodeType = 'Folder' | 'Topic' | 'Highlight' | 'Item'

export interface FolderNode {
  uuid: string
  typ: FolderNodeType
  name: string
  ref: string | null
  createdAt: string
  childrenUpdatedAt: string
  hasChildren: boolean
}

export interface EffectFolderCommands {
  getRootFolderUuid: () => Effect.Effect<string, CommandError>
  isFolderNodeExist: (uuid: string) => Effect.Effect<boolean, CommandError<ApiError>>
  getFolderNode: (uuid: string) => Effect.Effect<FolderNode, CommandError<ApiError>>
  getFolderNodeChildren: (parentUuid: string) => Effect.Effect<FolderNode[], CommandError<ApiError>>
  createFolderNode: (
    parentUuid: string,
    uuid: string,
    typ: FolderNodeType,
    name: string,
    reference: string | null,
  ) => Effect.Effect<null, CommandError<ApiError>>
  renameFolderNode: (uuid: string, newName: string) => Effect.Effect<null, CommandError<ApiError>>
  deleteFolderNodeRetParent: (uuid: string) => Effect.Effect<string | null, CommandError<ApiError>>
  getParentFolderNodeUuid: (childUuid: string) => Effect.Effect<string | null, CommandError<ApiError>>
}

export class FolderService extends Effect.Tag('FolderService')<FolderService, EffectFolderCommands>() {}
