import { useFolderChildrenInvalidate, useMutateCreateFolderNode, useMutateCreateTopicNode, useRootFolderNodeUUID } from '@memorilo/api/query'

import { cn } from '@memorilo/utils/utils'
import { Match } from 'effect'
import { useTranslation } from 'react-i18next'
import { LuFilePlus, LuFolderPlus, LuListCollapse, LuRefreshCcw } from 'react-icons/lu'
import { toast } from 'react-toastify'
import { v7 as uuidV7 } from 'uuid'
import { useNoteFolderTree } from './note-folder-tree'

export function NoteFolderTreeToolbar() {
  const { t } = useTranslation('app')
  const { selectedIds } = useNoteFolderTree()
  const { data: rootUUID, status } = useRootFolderNodeUUID()
  const createFolderMutation = useMutateCreateFolderNode()
  const createTopicMutation = useMutateCreateTopicNode()
  const handleInvalidate = useFolderChildrenInvalidate()
  const tree = useNoteFolderTree()

  const targetUUID = Match.value(selectedIds.length).pipe(
    Match.when(0, () => rootUUID ?? null),
    Match.when(1, () => selectedIds[0]),
    Match.orElse(() => null),
  )

  function handleCreateTopic() {
    if (targetUUID === null)
      return
    createTopicMutation.mutate({
      parentUUID: targetUUID,
      name: t('note_folder_tree.new_topic'),
    }, {
      onSuccess: () => {},
      onError: (error) => {
        toast.error(t('note_folder_tree.create_topic_error', { error: String(error) }))
      },
    })
  }

  function handleCreateFolder() {
    if (targetUUID === null)
      return
    const uuid = uuidV7()
    createFolderMutation.mutate({
      parentUUID: targetUUID,
      uuid,
      name: t('note_folder_tree.new_folder'),
    }, {
      onSuccess: () => {},
      onError: (error) => {
        toast.error(t('note_folder_tree.create_folder_error', { error: String(error) }))
      },
    })
  }
  function handleDeexpandAll() {
    tree.expandedIds.forEach(tree.toggleExpanded)
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
        onClick={handleCreateTopic}
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
      <button
        type="button"
        className="p-1.5 hover:bg-secondary"
        onClick={() => handleInvalidate()}
      >
        <LuRefreshCcw />
      </button>
      <button type="button" className="p-1.5 hover:bg-secondary" onClick={handleDeexpandAll}>
        <LuListCollapse />
      </button>
    </div>
  )
}
