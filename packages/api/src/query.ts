import type { Effect } from 'effect'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
