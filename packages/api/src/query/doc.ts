import type { FolderNode } from '../index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { eq } from '../index'
import { effectCommands } from '../native/effect'

export function useDocTitle(docId: string) {
  return useQuery(eq.queryOptions({
    queryKey: ['docTitle', docId],
    queryFn: () => effectCommands.getDocTitle(docId),
  }))
}

export function useMutateDocTitle() {
  const client = useQueryClient()
  return useMutation(eq.mutationOptions({
    mutationKey: ['updateDocTitle'],
    mutationFn: (vars: { docId: string, title: string }) =>
      effectCommands.updateDocTitle(vars.docId, vars.title),
    onSuccess: (_result, vars) => {
      // Keep the doc title query in sync immediately after mutation.
      client.setQueryData(['docTitle', vars.docId], vars.title)
      // Only invalidate folder queries that actually reference this doc id.
      client.invalidateQueries({
        queryKey: ['folderNodeChildren'],
        predicate: query => Array.isArray(query.state.data)
          && (query.state.data as FolderNode[]).some(node => node.ref === vars.docId),
      })
      // Invalidate single-node queries that resolve to the updated doc ref.
      client.invalidateQueries({
        queryKey: ['folderNode'],
        predicate: query => (query.state.data as FolderNode | undefined)?.ref === vars.docId,
      })
    },
  }))
}
