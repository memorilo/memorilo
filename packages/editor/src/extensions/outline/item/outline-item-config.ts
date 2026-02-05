import type { Editor } from '@tiptap/core'
import type { TaskItemOptions } from '@tiptap/extension-list'
import type { Plugin } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { outlineCommands } from '../actions/outline-actions'
import { outlineItemContent as outlineItemContentSpec, outlineItemContentWithTable as outlineItemContentWithTableSpec } from '../core/outline-node-constants'
import { createOutlineItemEnterPlugin } from './outline-item-enter'
import { OutlineItemView } from './outline-item-view'

export interface OutlineTaskItemOptions extends TaskItemOptions {
  allowTable?: boolean
  onOutlineClick?: (uuid: string) => void
}

interface OutlineItemContentContext {
  options: {
    allowTable?: boolean
  }
}

function buildOutlineItemContent(this: OutlineItemContentContext) {
  return this.options.allowTable ? outlineItemContentWithTableSpec : outlineItemContentSpec
}

interface OutlineItemPluginContext {
  editor: Editor
  name: string
}

function outlineItemPlugins(this: OutlineItemPluginContext): Plugin[] {
  return [createOutlineItemEnterPlugin(this.editor, this.name)]
}

export const outlineItemSharedSpec = {
  content: buildOutlineItemContent,
  addNodeView() {
    return ReactNodeViewRenderer(OutlineItemView)
  },
  addCommands() {
    return outlineCommands
  },
  addProseMirrorPlugins: outlineItemPlugins,
}
