import type { LoroDocType } from 'loro-prosemirror'
import { Extension } from '@tiptap/core'
import { keymap } from '@tiptap/pm/keymap'
import {
  CursorEphemeralStore,
  LoroEphemeralCursorPlugin,
  LoroSyncPlugin,
  LoroUndoPlugin,
  redo,
  undo,
} from 'loro-prosemirror'
import uniqolor from 'uniqolor'

export function createLoroSyncExtension(doc: LoroDocType, username?: string) {
  const presence = new CursorEphemeralStore(doc.peerIdStr)

  return Extension.create({
    name: 'loro-sync',
    addProseMirrorPlugins() {
      return [
        LoroSyncPlugin({ doc }),
        LoroUndoPlugin({ doc }),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
        }),
        LoroEphemeralCursorPlugin(presence, {
          user: username
            ? ({
                name: username,
                color: uniqolor(username).color,
              })
            : undefined,
        }),
      ]
    },
  })
}
