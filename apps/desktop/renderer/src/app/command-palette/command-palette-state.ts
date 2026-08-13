export type CommandPaletteActionState = 'idle' | 'pending' | 'failed'

export interface CommandPaletteState {
  action: CommandPaletteActionState
  open: boolean
  query: string
  selectedId: string | null
  sessionId: number
}

export type CommandPaletteEvent
  = | { type: 'actionFailed', sessionId: number }
    | { type: 'actionStarted' }
    | { type: 'actionSucceeded', sessionId: number }
    | { type: 'close' }
    | { type: 'open' }
    | { query: string, type: 'queryChanged' }
    | { selectedId: string | null, type: 'selectionChanged' }

export const initialCommandPaletteState: CommandPaletteState = {
  action: 'idle',
  open: false,
  query: '',
  selectedId: null,
  sessionId: 0,
}

export function reduceCommandPaletteState(
  state: CommandPaletteState,
  event: CommandPaletteEvent,
): CommandPaletteState {
  switch (event.type) {
    case 'open':
      return {
        action: 'idle',
        open: true,
        query: '',
        selectedId: null,
        sessionId: state.sessionId + 1,
      }
    case 'close':
      return state.open || state.action !== 'idle'
        ? { ...state, action: 'idle', open: false }
        : state
    case 'queryChanged':
      return state.open
        ? { ...state, action: 'idle', query: event.query, selectedId: null }
        : state
    case 'selectionChanged':
      return state.open ? { ...state, selectedId: event.selectedId } : state
    case 'actionStarted':
      return state.open && state.action !== 'pending'
        ? { ...state, action: 'pending' }
        : state
    case 'actionFailed':
      return state.open && state.action === 'pending' && state.sessionId === event.sessionId
        ? { ...state, action: 'failed' }
        : state
    case 'actionSucceeded':
      return state.open && state.action === 'pending' && state.sessionId === event.sessionId
        ? { ...state, action: 'idle', open: false }
        : state
  }
}
