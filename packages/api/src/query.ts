import type { Effect } from 'effect'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { eq } from '.'
import { effectCommands } from './command'

export function useInvalidateFolderNodeChildren(parentUuid: string) {
  const client = useQueryClient()
  return () => client.invalidateQueries({
    queryKey: ['folderNodeChildren', parentUuid],
  })
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
  const client = useQueryClient()
  return useMutation(eq.mutationOptions({
    mutationKey: ['createFolderNode'],
    mutationFn: (vars: { parentUUID: string, uuid: string, name: string }) =>
      effectCommands.createFolderNode(vars.parentUUID, vars.uuid, 'Folder', vars.name, null),
    onSuccess: (_, vars) => {
      client.invalidateQueries({
        queryKey: ['folderNodeChildren', vars.parentUUID],
      })
    },
  }))
}
