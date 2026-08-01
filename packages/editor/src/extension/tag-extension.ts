import type { Extension, Union } from 'prosekit/core'
import type { Command } from 'prosekit/pm/state'
import type { EditorTag } from '../adapters/editor-adapters'
import type { TagSpecExtension } from '../schema/tag-schema'
import type { TagEditEntry, TagRuntime } from '../tag/tag-runtime'
import { defineCommands, defineKeymap, definePlugin, insertNode, union } from 'prosekit/core'
import { defineInputRule } from 'prosekit/extensions/input-rule'
import { InputRule } from 'prosekit/pm/inputrules'
import { NodeSelection, Plugin, PluginKey, TextSelection } from 'prosekit/pm/state'
import { defineTagSpec } from '../schema/tag-schema'
import { getTagLabelError } from '../tag/tag-label'

export type { TagAttrs } from '../schema/tag-schema'

type TagCommandsExtension = Extension<{
  Commands: {
    insertTag: [tag: EditorTag]
  }
}>

function defineTagCommands(): TagCommandsExtension {
  return defineCommands({
    insertTag: (tag: EditorTag) => insertNode({ type: 'tag', attrs: tag }),
  })
}

function defineTagInputRule(runtime: TagRuntime): Extension {
  const regex = /(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)\s$/u
  return defineInputRule(new InputRule(regex, (state, match, start, end) => {
    const label = match[1]
    if (!label || getTagLabelError(label))
      return null

    const fullMatch = match[0]
    const hashOffset = fullMatch.lastIndexOf('#')
    if (hashOffset === -1)
      return null

    const tag = runtime.resolveOrCreate(label)
    const tagNode = state.schema.nodes.tag?.create(tag)
    if (!tagNode)
      throw new Error('The editor schema is missing the tag node')

    return state.tr.replaceWith(start + hashOffset, end, [tagNode, state.schema.text(' ')])
  }))
}

interface TagSelectionOrigin {
  position: number
  direction: -1 | 1
}

function createTagArrowCommand(
  runtime: TagRuntime,
  navigationKey: PluginKey<TagSelectionOrigin | null>,
  direction: -1 | 1,
): Command {
  return (state, dispatch) => {
    const { selection } = state

    if (selection instanceof NodeSelection && selection.node.type.name === 'tag') {
      const origin = navigationKey.getState(state)
      if (!origin || origin.position !== selection.from)
        return false

      if (origin.direction !== direction) {
        if (dispatch) {
          const position = direction === -1 ? selection.from : selection.to
          dispatch(state.tr
            .setSelection(TextSelection.create(state.doc, position))
            .setMeta(navigationKey, null))
        }
        return true
      }

      const entry: TagEditEntry = direction === 1 ? 'start' : 'end'
      if (!dispatch)
        return true
      if (!runtime.requestEditing(selection.from, entry))
        return false
      dispatch(state.tr.setMeta(navigationKey, null))
      return true
    }

    if (!selection.empty)
      return false

    const adjacentNode = direction === 1 ? selection.$head.nodeAfter : selection.$head.nodeBefore
    if (adjacentNode?.type.name !== 'tag')
      return false

    const position = direction === 1 ? selection.head : selection.head - adjacentNode.nodeSize
    dispatch?.(state.tr
      .setSelection(NodeSelection.create(state.doc, position))
      .setMeta(navigationKey, { position, direction } satisfies TagSelectionOrigin))
    return true
  }
}

function defineTagNavigation(runtime: TagRuntime): Extension {
  const navigationKey = new PluginKey<TagSelectionOrigin | null>('tag-navigation')
  const navigationPlugin = new Plugin<TagSelectionOrigin | null>({
    key: navigationKey,
    state: {
      init: () => null,
      apply: (transaction, previousOrigin) => {
        const nextOrigin = transaction.getMeta(navigationKey) as TagSelectionOrigin | null | undefined
        if (nextOrigin !== undefined)
          return nextOrigin

        if (!previousOrigin)
          return null

        const mappedOrigin = transaction.mapping.mapResult(previousOrigin.position, 1)
        if (mappedOrigin.deleted)
          return null

        const { selection } = transaction
        if (
          selection instanceof NodeSelection
          && selection.node.type.name === 'tag'
          && selection.from === mappedOrigin.pos
        ) {
          return { ...previousOrigin, position: mappedOrigin.pos }
        }
        return null
      },
    },
  })

  return union(
    definePlugin(navigationPlugin),
    defineKeymap({
      ArrowLeft: createTagArrowCommand(runtime, navigationKey, -1),
      ArrowRight: createTagArrowCommand(runtime, navigationKey, 1),
    }),
  )
}

export type TagExtension = Union<[TagSpecExtension, TagCommandsExtension]>

export function defineTag(runtime: TagRuntime) {
  return union(
    defineTagSpec(),
    defineTagCommands(),
    defineTagInputRule(runtime),
    defineTagNavigation(runtime),
  )
}
