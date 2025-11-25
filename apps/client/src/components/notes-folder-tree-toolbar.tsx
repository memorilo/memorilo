import { Button } from '@memorilo/components/ui/button'
import { LuFilePlus, LuFolderPlus, LuIndentDecrease, LuListCollapse, LuRefreshCcw } from 'react-icons/lu'
import { useNotesTree } from './notes-folder-tree'

export function NotesFolderTreeToolbar() {
  const tree = useNotesTree()
  return (
    <div className="w-full flex gap-1 border-y">
      <span className="flex-1" />
      <button type="button" className="p-1.5 hover:bg-secondary">
        <LuFilePlus />
      </button>
      <button type="button" className="p-1.5 hover:bg-secondary">
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
