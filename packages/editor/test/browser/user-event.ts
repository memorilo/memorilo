import { act } from '@testing-library/react'
import { userEvent as browserUserEvent } from '@vitest/browser/context'
import { isApple } from 'prosekit/core'

export function modShortcut(key: string, options: { shift?: boolean } = {}): string {
  const modifier = isApple ? 'Meta' : 'Control'
  return options.shift
    ? `{${modifier}>}{Shift>}${key}{/Shift}{/${modifier}}`
    : `{${modifier}>}${key}{/${modifier}}`
}

export function redoShortcut(): string {
  return isApple ? modShortcut('z', { shift: true }) : modShortcut('y')
}

async function runInReactAct(action: () => Promise<unknown>): Promise<void> {
  await act(async () => {
    await action()
  })
}

function selectedBlockId(): string | null {
  const selection = document.getSelection()
  const focusNode = selection?.focusNode
  const focusElement = focusNode instanceof Element ? focusNode : focusNode?.parentElement
  return focusElement?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? null
}

async function waitForBrowserPaint(): Promise<void> {
  await runInReactAct(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  }))
}

async function pressHomeUntilCaretStarts(blockId: string, attemptsRemaining: number): Promise<void> {
  await runInReactAct(() => browserUserEvent.keyboard('{Home}'))
  const selection = document.getSelection()
  if (selection?.isCollapsed && selection.focusOffset === 0 && selectedBlockId() === blockId)
    return
  if (attemptsRemaining <= 1)
    throw new Error('Browser did not place the caret at the start of the target editor element')
  await waitForBrowserPaint()
  await pressHomeUntilCaretStarts(blockId, attemptsRemaining - 1)
}

export const userEvent = {
  click: (...args: Parameters<typeof browserUserEvent.click>) => runInReactAct(() => browserUserEvent.click(...args)),
  hover: (...args: Parameters<typeof browserUserEvent.hover>) => runInReactAct(() => browserUserEvent.hover(...args)),
  keyboard: (...args: Parameters<typeof browserUserEvent.keyboard>) => runInReactAct(() => browserUserEvent.keyboard(...args)),
  selectOptions: (...args: Parameters<typeof browserUserEvent.selectOptions>) => runInReactAct(() => browserUserEvent.selectOptions(...args)),
}

export async function placeCaretAtStart(element: HTMLElement): Promise<void> {
  const blockId = element.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
  if (!blockId)
    throw new Error('Caret target is not inside an editor Block')
  await userEvent.click(element)
  await pressHomeUntilCaretStarts(blockId, 5)
}
