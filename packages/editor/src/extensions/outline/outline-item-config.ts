import type { Editor } from '@tiptap/core'
import type { TaskItemOptions } from '@tiptap/extension-list'
import type { Plugin } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { outlineCommands } from './outline-actions'
import { OutlineItemView } from './outline-item-view'
import { outlineItemContent as outlineItemContentSpec, outlineItemContentWithTable as outlineItemContentWithTableSpec } from './outline-node-constants'
import { createOutlineItemEnterPlugin } from './outline-node-helpers'

export interface OutlineTaskItemOptions extends TaskItemOptions {
  allowTable?: boolean
}

interface OutlineItemContentContext {
  options: {
    allowTable?: boolean
  }
}

interface OutlineItemPluginContext {
  editor: Editor
  name: string
}

function buildOutlineItemContent(this: OutlineItemContentContext) {
  return this.options.allowTable ? outlineItemContentWithTableSpec : outlineItemContentSpec
}

function outlineItemPlugins(this: OutlineItemPluginContext): Plugin[] {
  return [
    createOutlineItemEnterPlugin(this.editor, this.name),
  ]
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
