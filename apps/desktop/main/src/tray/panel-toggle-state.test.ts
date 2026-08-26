import { describe, expect, it } from 'vitest'
import { initialPanelToggleState, panelBlur, settleTrayInteraction, trayClick, trayMouseDown } from './panel-toggle-state'

function click(state = initialPanelToggleState) {
  return settleTrayInteraction(panelBlur(trayClick(panelBlur(trayMouseDown(state)))))
}

describe('panel toggle state', () => {
  it('opens when tray blur arrives before the first click', () => {
    expect(click()).toEqual({ open: true, suppressBlur: false })
  })

  it('closes on the next rapid click without a stale blur reopening it', () => {
    expect(click(click())).toEqual({ open: false, suppressBlur: false })
  })

  it('hides on an external blur after tray interaction settles', () => {
    expect(panelBlur(click())).toEqual({ open: false, suppressBlur: false })
  })
})
