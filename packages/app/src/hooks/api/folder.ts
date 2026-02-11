import { getEq } from '@memorilo/api-spec/query'
import { DocService } from '@memorilo/api-spec/services/doc'
import { FolderService } from '@memorilo/api-spec/services/folder'
import { SystemService } from '@memorilo/api-spec/services/system'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { app } from '@tauri-apps/api'
import { Effect } from 'effect'

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
  const eq = getEq()
  return useQuery(eq.queryOptions({
    queryKey: ['folderNodeChildren', parentUuid],
    queryFn: () => Effect.gen(function* () {
      const folderService = yield* FolderService
      return yield* folderService.getFolderNodeChildren(parentUuid)
    }),
  }))
}

export function useFolderNode(uuid: string) {
  const eq = getEq()
  return useQuery(eq.queryOptions({
    queryKey: ['folderNode', uuid],
    queryFn: () => Effect.gen(function* () {
      const folderService = yield* FolderService
      return yield* folderService.getFolderNode(uuid)
    }),
  }))
}

export function useRootFolderNodeUUID() {
  const eq = getEq()
  return useQuery(eq.queryOptions({
    queryKey: ['rootFolderNode'],
    queryFn: () => Effect.gen(function* () {
      const folderService = yield* FolderService
      return yield* folderService.getRootFolderUuid()
    }) as Effect.Effect<string, never>,
  }))
}

export function useMutateCreateFolderNode() {
  const invalidate = useFolderChildrenInvalidate()
  const eq = getEq()
  return useMutation(eq.mutationOptions({
    mutationKey: ['createFolderNode'],
    mutationFn: (vars: { parentUUID: string, uuid: string, name: string }) => Effect.gen(function* () {
      const folderService = yield* FolderService
      const grandparent = yield* folderService.getParentFolderNodeUuid(vars.parentUUID)
      yield* folderService.createFolderNode(vars.parentUUID, vars.uuid, 'Folder', vars.name, null)
      return grandparent
    }),
    onSuccess: (grandParentUUID, vars) => {
      if (grandParentUUID) {
        invalidate(grandParentUUID)
      }
      invalidate(vars.parentUUID)
    },
  }))
}

export function useMutateCreateTopicNode() {
  const invalidate = useFolderChildrenInvalidate()
  const eq = getEq()
  return useMutation(eq.mutationOptions({
    mutationKey: ['createTopicNode'],
    mutationFn: (vars: { parentUUID: string, name: string }) => Effect.gen(function* () {
      const folderService = yield* FolderService
      const docService = yield* DocService
      const grandparent = yield* folderService.getParentFolderNodeUuid(vars.parentUUID)
      yield* docService.createTopic(vars.parentUUID, vars.name)
      return grandparent
    }),
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
  const eq = getEq()
  return useMutation(eq.mutationOptions({
    mutationKey: ['deleteFolderNode'],
    mutationFn: (vars: { uuid: string }) => Effect.gen(function* () {
      const folderService = yield* FolderService
      return yield* folderService.deleteFolderNodeRetParent(vars.uuid)
    }),
    onSuccess: (parentUUID) => {
      if (parentUUID) {
        invalidate(parentUUID)
      }
    },
  }))
}

export function useMutateRenameFolderNode() {
  const invalidate = useFolderChildrenInvalidate()
  const client = useQueryClient()
  const eq = getEq()
  return useMutation(eq.mutationOptions({
    mutationKey: ['renameFolderNode'],
    mutationFn: (vars: { uuid: string, newName: string }) => Effect.gen(function* () {
      const folderService = yield* FolderService
      const { parentUUID, node } = yield* Effect.all({
        parentUUID: folderService.getParentFolderNodeUuid(vars.uuid),
        node: folderService.getFolderNode(vars.uuid),
        result: folderService.renameFolderNode(vars.uuid, vars.newName),
      })
      return { parentUUID, ref: node.ref }
    }),
    onSuccess: ({ parentUUID, ref }, vars) => {
      if (parentUUID) {
        invalidate(parentUUID)
      }
      client.invalidateQueries({ queryKey: ['folderNode', vars.uuid] })
      if (ref) {
        client.invalidateQueries({ queryKey: ['docTitle', ref] })
      }
    },
  }))
}

export interface AboutInfo {
  version: string
  tauriVersion: string
  clientID: string
  appLocalDataDir: string
  gitCommitId: string
  docNodesCount: number
  docUpdatesCount: number
}

function loadAboutInfo() {
  return Effect.gen(function* () {
    const systemService = yield* SystemService
    return yield* Effect.all({
      version: Effect.tryPromise(() => app.getVersion()).pipe(
        Effect.catchAll(() => Effect.succeed('')),
      ),
      tauriVersion: Effect.tryPromise(() => app.getTauriVersion()).pipe(
        Effect.catchAll(() => Effect.succeed('')),
      ),
      clientID: systemService.getClientId().pipe(
        Effect.catchAll(() => Effect.succeed('')),
      ),
      appLocalDataDir: systemService.getAppLocalDataDir().pipe(
        Effect.catchAll(() => Effect.succeed('')),
      ),
      gitCommitId: systemService.getGitCommitId().pipe(
        Effect.catchAll(() => Effect.succeed('')),
      ),
      docNodesCount: systemService.getDocNodesCount().pipe(
        Effect.map(value => Number.parseInt(value, 10) || 0),
        Effect.catchAll(() => Effect.succeed(0)),
      ),
      docUpdatesCount: systemService.getDocUpdatesCount().pipe(
        Effect.map(value => Number.parseInt(value, 10) || 0),
        Effect.catchAll(() => Effect.succeed(0)),
      ),
    })
  })
}

export function useAboutInfo() {
  const eq = getEq()
  return useQuery(eq.queryOptions({
    queryKey: ['aboutInfo'],
    queryFn: () => loadAboutInfo(),
  }))
}
