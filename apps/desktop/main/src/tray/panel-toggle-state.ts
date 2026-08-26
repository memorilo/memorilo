export interface PanelToggleState {
  open: boolean
  suppressBlur: boolean
}

export const initialPanelToggleState: PanelToggleState = {
  open: false,
  suppressBlur: false,
}

export function trayMouseDown(state: PanelToggleState): PanelToggleState {
  return { ...state, suppressBlur: true }
}

export function trayClick(state: PanelToggleState): PanelToggleState {
  return { open: !state.open, suppressBlur: true }
}

export function panelBlur(state: PanelToggleState): PanelToggleState {
  return state.suppressBlur ? state : { ...state, open: false }
}

export function settleTrayInteraction(state: PanelToggleState): PanelToggleState {
  return { ...state, suppressBlur: false }
}
