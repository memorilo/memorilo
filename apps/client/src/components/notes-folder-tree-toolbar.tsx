import { useMutateCreateFolderNode, useRootFolderNodeUUID } from '@memorilo/api/query'
import { useTree } from '@memorilo/components/ui/tree'
import { cn } from '@memorilo/utils/utils'
import { Match } from 'effect'
import { LuFilePlus, LuFolderPlus, LuListCollapse, LuRefreshCcw } from 'react-icons/lu'
import { v7 as uuidV7 } from 'uuid'

export function NotesFolderTreeToolbar() {
  const { selectedIds, setSelectedIds } = useTree()
  const { data: rootUUID, status } = useRootFolderNodeUUID()
  const createFolderMutation = useMutateCreateFolderNode()

  const targetUUID = Match.value(selectedIds.length).pipe(
    Match.when(0, () => rootUUID ?? null),
    Match.when(1, () => selectedIds[0]),
    Match.orElse(() => null),
  )

  function handleCreateFolder() {
    if (targetUUID === null)
      return
    const uuid = uuidV7()
    createFolderMutation.mutate({
      parentUUID: targetUUID,
      uuid,
      name: 'New Folder',
    }, {
      onSuccess: () => {
        setSelectedIds([uuid])
      },
      onError: (error) => {
        // TODO: Show i18n message notification
        console.error('Failed to create folder:', error)
      },
    })
  }

  return (
    <div className="w-full flex gap-1 border-y">
      <span className="flex-1" />
      <button
        type="button"
        disabled={targetUUID === null || status !== 'success'}
        className={cn(
          'p-1.5 hover:bg-secondary',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <LuFilePlus />
      </button>
      <button
        type="button"
        disabled={targetUUID === null || status !== 'success'}
        className={cn(
          'p-1.5 hover:bg-secondary',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        onClick={handleCreateFolder}
      >
        <LuFolderPlus />
      </button>
      <button type="button" className="p-1.5 hover:bg-secondary">
        <LuRefreshCcw />
      </button>
      <button type="button" className="p-1.5 hover:bg-secondary">
        <LuListCollapse />
      </button>
    </div>
  )
}
