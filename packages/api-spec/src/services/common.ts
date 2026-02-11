export type Result<T, E>
  = | { status: 'ok', data: T }
    | { status: 'error', error: E }

export type ErrorKind
  = | 'DatabaseError'
    | 'IoError'
    | 'SerializationError'
    | 'CrdtError'
    | 'StateError'

export interface ApiError {
  _tag: ErrorKind
  message: string
  inner_message: string
}
