import type { FolderNode } from '@memorilo/api-spec/services/folder'
import { getEq } from '@memorilo/api-spec/query'
import { DocService } from '@memorilo/api-spec/services/doc'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Effect } from 'effect'

export function useDocTitle(docId: string) {
  const eq = getEq()
  return useQuery(eq.queryOptions({
    queryKey: ['docTitle', docId],
    queryFn: () => Effect.gen(function* () {
      const docService = yield* DocService
      return yield* docService.getDocTitle(docId)
    }),
  }))
}

export function useMutateDocTitle() {
  const client = useQueryClient()
  const eq = getEq()
  return useMutation(eq.mutationOptions({
    mutationKey: ['updateDocTitle'],
    mutationFn: (vars: { docId: string, title: string }) => Effect.gen(function* () {
      const docService = yield* DocService
      return yield* docService.updateDocTitle(vars.docId, vars.title)
    }),
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
