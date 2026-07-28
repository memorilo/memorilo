import { act } from '@testing-library/react'
import { userEvent as browserUserEvent } from '@vitest/browser/context'

async function runInReactAct(action: () => Promise<unknown>): Promise<void> {
  await act(async () => {
    await action()
  })
}

export const userEvent = {
  click: (...args: Parameters<typeof browserUserEvent.click>) => runInReactAct(() => browserUserEvent.click(...args)),
  hover: (...args: Parameters<typeof browserUserEvent.hover>) => runInReactAct(() => browserUserEvent.hover(...args)),
  keyboard: (...args: Parameters<typeof browserUserEvent.keyboard>) => runInReactAct(() => browserUserEvent.keyboard(...args)),
  selectOptions: (...args: Parameters<typeof browserUserEvent.selectOptions>) => runInReactAct(() => browserUserEvent.selectOptions(...args)),
}
