import type { BasicExtension } from 'prosekit/basic'
import type { Editor } from 'prosekit/core'

function getClipboard(): Clipboard {
  if (!navigator.clipboard)
    throw new Error('The Clipboard API is unavailable')

  return navigator.clipboard
}

function createPasteEvent(dataTransfer: DataTransfer): ClipboardEvent {
  return new ClipboardEvent('paste', { clipboardData: dataTransfer })
}

async function writeSelection(editor: Editor<BasicExtension>): Promise<void> {
  const { selection } = editor.state
  if (selection.empty)
    throw new Error('Cannot copy an empty editor selection')

  if (typeof ClipboardItem === 'undefined')
    throw new TypeError('ClipboardItem is unavailable')

  const { dom, text } = editor.view.serializeForClipboard(selection.content())
  const item = new ClipboardItem({
    'text/html': new Blob([dom.innerHTML], { type: 'text/html' }),
    'text/plain': new Blob([text], { type: 'text/plain' }),
  })
  await getClipboard().write([item])
}

export async function copySelection(editor: Editor<BasicExtension>): Promise<void> {
  await writeSelection(editor)
}

export async function cutSelection(editor: Editor<BasicExtension>): Promise<void> {
  const selection = editor.state.selection
  await writeSelection(editor)

  if (!editor.state.selection.eq(selection))
    throw new Error('The editor selection changed before cut completed')

  editor.view.dispatch(
    editor.state.tr
      .deleteSelection()
      .scrollIntoView()
      .setMeta('uiEvent', 'cut'),
  )
}

async function readClipboardText(item: ClipboardItem, type: string): Promise<string> {
  return await (await item.getType(type)).text()
}

export async function pasteClipboard(editor: Editor<BasicExtension>): Promise<void> {
  const items = await getClipboard().read()

  const htmlItem = items.find(item => item.types.includes('text/html'))
  if (htmlItem) {
    const dataTransfer = new DataTransfer()
    const html = await readClipboardText(htmlItem, 'text/html')
    dataTransfer.setData('text/html', html)
    if (htmlItem.types.includes('text/plain')) {
      dataTransfer.setData('text/plain', await readClipboardText(htmlItem, 'text/plain'))
    }
    editor.view.pasteHTML(html, createPasteEvent(dataTransfer))
    return
  }

  const textItem = items.find(item => item.types.includes('text/plain'))
  if (textItem) {
    const dataTransfer = new DataTransfer()
    const text = await readClipboardText(textItem, 'text/plain')
    dataTransfer.setData('text/plain', text)
    editor.view.pasteText(text, createPasteEvent(dataTransfer))
    return
  }

  for (const item of items) {
    const imageType = item.types.find(type => type.startsWith('image/'))
    if (!imageType)
      continue

    const blob = await item.getType(imageType)
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([blob], 'pasted-image', { type: imageType }))
    editor.view.pasteHTML('', createPasteEvent(dataTransfer))
    return
  }
}
