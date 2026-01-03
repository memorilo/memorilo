import { createEditor } from 'slate'
import { describe, expect, it, vi } from 'vitest'
import { onCodeblockExit } from './on-codeblock-exit'

function createKeyEvent(key: string, options?: { shiftKey?: boolean }) {
  return {
    key,
    shiftKey: options?.shiftKey ?? false,
    preventDefault: vi.fn(),
  } as any
}

describe('onCodeblockExit', () => {
  it('exits codeblock when pressing Enter in last empty code-line', () => {
    const editor = createEditor()
    editor.children = [
      {
        type: 'indent',
        children: [
          {
            type: 'codeblock',
            children: [
              { type: 'code-line', children: [{ text: 'console.log(1)' }] },
              { type: 'code-line', children: [{ text: '' }] },
            ],
          },
        ],
      },
    ] as any

    editor.selection = {
      anchor: { path: [0, 0, 1, 0], offset: 0 },
      focus: { path: [0, 0, 1, 0], offset: 0 },
    } as any

    const event = createKeyEvent('Enter')
    const handled = onCodeblockExit(event, editor)

    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)

    const indent = editor.children[0] as any
    expect(indent.children).toHaveLength(2)
    expect(indent.children[0].type).toBe('codeblock')
    expect(indent.children[1].type).toBe('plain')

    const codeblock = indent.children[0] as any
    expect(codeblock.children).toHaveLength(1)
    expect(codeblock.children[0].type).toBe('code-line')
    expect(codeblock.children[0].children[0].text).toBe('console.log(1)')

    expect(editor.selection?.anchor.path).toEqual([0, 1, 0])
    expect(editor.selection?.anchor.offset).toBe(0)
  })

  it('does not handle Enter when current code-line is not empty', () => {
    const editor = createEditor()
    editor.children = [
      {
        type: 'indent',
        children: [
          {
            type: 'codeblock',
            children: [{ type: 'code-line', children: [{ text: 'x' }] }],
          },
        ],
      },
    ] as any

    editor.selection = {
      anchor: { path: [0, 0, 0, 0], offset: 1 },
      focus: { path: [0, 0, 0, 0], offset: 1 },
    } as any

    const event = createKeyEvent('Enter')
    const handled = onCodeblockExit(event, editor)

    expect(handled).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect((editor.children[0] as any).children).toHaveLength(1)
  })
})
