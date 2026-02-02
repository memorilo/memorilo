import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import * as Y from 'yjs'

const rootGutterKey = new PluginKey('outlineRootGutter')

function createLine() {
  const line = document.createElement('span')
  line.className = 'pointer-events-none absolute border-l border-dashed border-gray-300 dark:border-gray-600 top-6 bottom-0 left-5'
  line.setAttribute('aria-hidden', 'true')
  return line
}

function createDotWrap() {
  const dotWrap = document.createElement('div')
  dotWrap.className = 'absolute right-0 top-0 w-6 h-6 flex items-center justify-center'
  return dotWrap
}

function createBullet() {
  const dot = document.createElement('div')
  dot.className = 'h-1.5 w-1.5 rounded-full bg-black dark:bg-white'
  dot.setAttribute('contenteditable', 'false')
  dot.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  return dot
}

function createOrderedNumber(index: number) {
  const number = document.createElement('span')
  number.className = 'font-mono text-gray-700 dark:text-gray-200'
  number.textContent = `${index}.`
  number.setAttribute('contenteditable', 'false')
  number.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })
  return number
}

function updateTaskChecked(editor: Editor, nextChecked: boolean) {
  const syncState = ySyncPluginKey.getState(editor.state)
  const yType = syncState?.type
  if (yType instanceof Y.XmlElement) {
    yType.setAttribute('checked', nextChecked)
    return
  }

  const attrs = {
    ...editor.state.doc.attrs,
    checked: nextChecked,
  }
  const tr = editor.state.tr
  try {
    editor.view.dispatch(tr.setNodeMarkup(0, undefined, attrs))
  }
  catch {
    // Ignore: root task item attrs are synced via Yjs when possible.
  }
}

function createTaskCheckbox(editor: Editor, checked: boolean) {
  const label = document.createElement('label')
  label.className = 'flex h-6 w-6 items-center justify-center'
  label.setAttribute('contenteditable', 'false')
  label.addEventListener('mousedown', (event) => {
    event.preventDefault()
  })

  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = checked
  input.className = 'h-4 w-4 cursor-pointer'
  input.addEventListener('change', (event) => {
    const target = event.currentTarget as HTMLInputElement
    updateTaskChecked(editor, target.checked)
  })

  label.appendChild(input)
  return label
}

function createRootGutter(editor: Editor) {
  const rootType = editor.state.schema.topNodeType.name
  const rootNode = editor.state.doc
  const gutter = document.createElement('div')
  gutter.className = 'outline-root-gutter'
  gutter.setAttribute('contenteditable', 'false')

  const dotWrap = createDotWrap()

  if (rootType === 'taskItem') {
    dotWrap.appendChild(createTaskCheckbox(editor, Boolean(rootNode.attrs.checked)))
  }
  else if (rootType === 'orderedItem') {
    // Root ordered item has no list context; default to 1.
    dotWrap.appendChild(createOrderedNumber(1))
  }
  else {
    dotWrap.appendChild(createBullet())
  }

  gutter.appendChild(createLine())
  gutter.appendChild(dotWrap)
  return gutter
}

export function createOutlineRootGutterPlugin(editor: Editor) {
  return new Plugin({
    key: rootGutterKey,
    props: {
      decorations(state) {
        const hideTitle = Boolean(editor.storage.paragraph?.hideTitle)
        if (hideTitle) {
          return null
        }
        const rootType = state.schema.topNodeType.name
        if (rootType !== 'listItem' && rootType !== 'orderedItem' && rootType !== 'taskItem') {
          return null
        }
        const widget = Decoration.widget(0, () => createRootGutter(editor), {
          key: 'outline-root-gutter',
          side: -1,
        })
        return DecorationSet.create(state.doc, [widget])
      },
    },
  })
}
