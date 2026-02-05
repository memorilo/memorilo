import { Extension } from '@tiptap/core'
import {
  BulletDocument,
  OutlineBulletList,
  OutlineItem,
  OutlineOrderedItem,
  OutlineOrderedList,
  OutlineRootItem,
  OutlineRootOrderedItem,
  OutlineRootTaskItem,
  OutlineTaskItem,
  OutlineTaskList,
  StyledHeading,
} from './nodes'
import { OutlineGapCursor, OutlinePlugins } from './plugins'
import './outline.css'

export interface OutlineOptions {
  bulletListHTMLAttributes: Record<string, any>
  allowTable?: boolean
  rootNode?: 'doc' | 'listItem' | 'orderedItem' | 'taskItem'
  onOutlineClick?: (uuid: string) => void
}

export const Outline = Extension.create<OutlineOptions>({
  name: 'outline',

  addOptions() {
    return {
      bulletListHTMLAttributes: {
        class: 'outline-list list-none m-0 p-0 pl-0',
      },
      allowTable: false,
      rootNode: 'doc',
    }
  },

  addExtensions() {
    const itemOptions = {
      allowTable: this.options.allowTable,
      onOutlineClick: this.options.onOutlineClick,
    }

    const rootNode = this.options.rootNode ?? 'doc'
    const listItemExtension = rootNode === 'listItem' ? OutlineRootItem : OutlineItem
    const orderedItemExtension = rootNode === 'orderedItem' ? OutlineRootOrderedItem : OutlineOrderedItem
    const taskItemExtension = rootNode === 'taskItem' ? OutlineRootTaskItem : OutlineTaskItem
    const rootExtensions = rootNode === 'doc' ? [BulletDocument] : []

    return [
      OutlineGapCursor,
      OutlinePlugins,
      OutlineBulletList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      listItemExtension.configure(itemOptions),
      OutlineOrderedList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      orderedItemExtension.configure(itemOptions),
      OutlineTaskList.configure({
        HTMLAttributes: this.options.bulletListHTMLAttributes,
      }),
      taskItemExtension.configure(itemOptions),
      ...rootExtensions,
      StyledHeading.configure({
        levels: [1, 2, 3, 4, 5, 6],
      }),
    ]
  },

})
