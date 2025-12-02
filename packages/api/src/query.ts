import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Effect } from 'effect'
import { eq } from '.'
import { effectCommands } from './command'

export function useFolderChildrenInvalidate() {
  const client = useQueryClient()
  return (uuid?: string) => {
    if (uuid) {
      client.invalidateQueries({
        queryKey: ['folderNodeChildren', uuid],
      })
    }
    else {
      client.invalidateQueries({
        queryKey: ['folderNodeChildren'],
      })
    }
  }
}

export function useFolderNodeChildren(parentUuid: string) {
  return useQuery(eq.queryOptions({
    queryKey: ['folderNodeChildren', parentUuid],
    queryFn: () => effectCommands.getFolderNodeChildren(parentUuid),
  }))
}

export function useFolderNode(uuid: string) {
  return useQuery(eq.queryOptions({
    queryKey: ['folderNode', uuid],
    queryFn: () => effectCommands.getFolderNode(uuid),
  }))
}

export function useRootFolderNodeUUID() {
  return useQuery(eq.queryOptions({
    queryKey: ['rootFolderNode'],
    queryFn: () => effectCommands.getRootFolderUuid() as Effect.Effect<string, never>,
  }))
}

export function useMutateCreateFolderNode() {
  const invalidate = useFolderChildrenInvalidate()
  return useMutation(eq.mutationOptions({
    mutationKey: ['createFolderNode'],
    mutationFn: (vars: { parentUUID: string, uuid: string, name: string }) => {
      const grandparent = effectCommands.getParentFolderNodeUuid(vars.parentUUID)
      const result = effectCommands.createFolderNode(vars.parentUUID, vars.uuid, 'Folder', vars.name, null)
      return Effect.zipWith(grandparent, result, (gp, _) => gp)
    },
    onSuccess: (grandParentUUID, vars) => {
      if (grandParentUUID) {
        invalidate(grandParentUUID)
      }
      invalidate(vars.parentUUID)
    },
  }))
}

export function useMutateDeleteFolderNode() {
  const invalidate = useFolderChildrenInvalidate()
  return useMutation(eq.mutationOptions({
    mutationKey: ['deleteFolderNode'],
    mutationFn: (vars: { uuid: string }) =>
      effectCommands.deleteFolderNodeRetParent(vars.uuid),
    onSuccess: (parentUUID) => {
      if (parentUUID) {
        invalidate(parentUUID)
      }
    },
  }))
}

export function useMutateRenameFolderNode() {
  const invalidate = useFolderChildrenInvalidate()
  return useMutation(eq.mutationOptions({
    mutationKey: ['renameFolderNode'],
    mutationFn: (vars: { uuid: string, newName: string }) => {
      const result = effectCommands.renameFolderNode(vars.uuid, vars.newName)
      return Effect.zipWith(
        effectCommands.getParentFolderNodeUuid(vars.uuid),
        result,
        (parentUUID, _) => parentUUID,
      )
    },
    onSuccess: (parent) => {
      if (parent) {
        invalidate(parent)
      }
    },
  }))
}
